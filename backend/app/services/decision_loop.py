"""
Per-chat background decision loop.

Each active chat gets a daemon thread that:
1. Waits for new-message signals
2. Debounces (to collect rapid-fire messages)
3. Collects unacknowledged (turn_id=NULL) messages
4. Calls the LLM to decide: WAIT for more, or REPLY now
5. If REPLY: saves all assistant messages, marks user messages acknowledged
6. If WAIT: records a Turn(wait) for debugging, keeps messages pending

This is the core "harness" that gives the LLM autonomy over conversation flow.
"""

import json
import logging
import threading
import time
from datetime import datetime, timezone

from app.database import SessionLocal
from app.llm import create_provider
from app.models.chat import Chat, Message, Turn
from app.models.debug import RawRequest, RawResponse
from app.models.settings import GlobalSettings
from app.services.chat_service import get_next_sequence
from app.services.settings_service import get_effective_settings

logger = logging.getLogger(__name__)

# ── Configurable defaults (fallback if not in DB) ───────────────────
_DEFAULT_DEBOUNCE = 2.0
_DEFAULT_MAX_PENDING = 10
_DEFAULT_MAX_WAIT = 30
_DEFAULT_MAX_REPLY = 5


def _get_config(db) -> dict:
    """Read decision loop config from GlobalSettings, with defaults."""
    gs = db.query(GlobalSettings).filter(GlobalSettings.id == 1).first()
    if gs is None:
        return {
            "debounce": _DEFAULT_DEBOUNCE,
            "max_pending": _DEFAULT_MAX_PENDING,
            "max_wait": _DEFAULT_MAX_WAIT,
            "max_reply": _DEFAULT_MAX_REPLY,
        }
    return {
        "debounce": getattr(gs, "debounce_seconds", None) or _DEFAULT_DEBOUNCE,
        "max_pending": getattr(gs, "max_pending_messages", None) or _DEFAULT_MAX_PENDING,
        "max_wait": getattr(gs, "max_wait_seconds", None) or _DEFAULT_MAX_WAIT,
        "max_reply": getattr(gs, "max_reply_messages", None) or _DEFAULT_MAX_REPLY,
    }

# ── Decision prompt ───────────────────────────────────────────────────

DECISION_INSTRUCTION = """[ROLE]
You are a participant in a live chat conversation. You receive the user's
messages as they arrive. Your job is to decide:

1. Whether to REPLY now, or WAIT for more messages from the user.

   REPLY when:
   - The user has clearly finished their thought
   - The user asked a question that expects your response
   - The conversation naturally expects you to speak now

   WAIT when:
   - The user seems like they might send more messages
   - The user's thought appears incomplete (trailing off, mid-sentence)

2. When you REPLY, decide how many messages to send (1–5).
   - Like a human texter, break long thoughts into short, natural messages
   - Each message should be self-contained but flow naturally into the next
   - Don't overthink it — most replies are 1–2 messages

[FORMAT]
Respond with EXACTLY the JSON below (no other text, no markdown fences):

For replying:
{"action":"reply","messages":[{"content":"first message"},{"content":"second message"}]}

For waiting:
{"action":"wait"}

[IMPORTANT]
- Respond ONLY with the JSON object, nothing else
- When replying, each message's "content" is a plain text string
- Do NOT wrap the JSON in markdown code blocks"""

# ── Decision Loop ─────────────────────────────────────────────────────


class DecisionLoop:
    """Background thread that manages LLM decision-making for one chat."""

    def __init__(self, chat_id: str):
        self.chat_id = chat_id
        self._wake = threading.Event()
        self._running = False
        self._thread: threading.Thread | None = None

    # ── Public API ──────────────────────────────────────────────────

    def start(self):
        """Start the background thread."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        logger.info("DecisionLoop started for chat %s", self.chat_id)

    def stop(self):
        """Stop the background thread."""
        self._running = False
        self._wake.set()  # Unblock the thread so it can exit
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)

    def signal(self):
        """Signal that a new message has arrived."""
        self._wake.set()

    # ── Main loop ────────────────────────────────────────────────────

    def _run(self):
        """Main loop: wait → debounce → process → repeat."""
        while self._running:
            # Wait for new-message signal
            self._wake.wait()
            if not self._running:
                return
            self._wake.clear()

            # Read debounce config from DB
            db_cfg = SessionLocal()
            try:
                cfg = _get_config(db_cfg)
            finally:
                db_cfg.close()

            # Debounce: collect rapid-fire follow-up messages
            time.sleep(cfg["debounce"])
            if not self._running:
                return

            # Process pending messages
            self._process_pending(cfg)

    # ── Core processing ──────────────────────────────────────────────

    def _process_pending(self, cfg: dict | None = None):
        """Collect pending messages, call LLM, handle the decision."""
        if cfg is None:
            cfg = _get_config(SessionLocal())

        db = SessionLocal()
        try:
            pending = (
                db.query(Message)
                .filter(Message.chat_id == self.chat_id, Message.turn_id == None)
                .order_by(Message.sequence_num)
                .all()
            )

            if not pending:
                return

            # Check safety limits
            oldest_age = (
                datetime.now(timezone.utc) - pending[0].created_at.replace(tzinfo=timezone.utc)
            ).total_seconds()
            force = (
                len(pending) >= cfg["max_pending"]
                or oldest_age >= cfg["max_wait"]
            )

            if force:
                self._force_reply(db, pending, oldest_age, cfg)
            else:
                self._llm_decide(db, pending, cfg)

            db.commit()
        except Exception:
            logger.exception("DecisionLoop error for chat %s", self.chat_id)
            db.rollback()
        finally:
            db.close()

    # ── LLM decision call ────────────────────────────────────────────

    def _llm_decide(self, db, pending: list[Message], cfg: dict | None = None):
        """Let the LLM decide whether to wait or reply.

        Sends the full conversation as properly-structured multi-turn messages
        so the LLM sees correct roles and context. Pending messages are marked
        [NEW] so the LLM can distinguish them from acknowledged history.
        """
        chat = db.query(Chat).filter(Chat.id == self.chat_id).first()
        if not chat:
            return

        effective = get_effective_settings(db, self.chat_id)

        # System prompt: chat's prompt + decision instructions
        system_prompt = self._build_decision_system_prompt(db, chat, effective)
        system_prompt += "\n\n" + DECISION_INSTRUCTION

        # Get all messages, split into acknowledged vs pending
        all_msgs = (
            db.query(Message)
            .filter(Message.chat_id == self.chat_id)
            .order_by(Message.sequence_num)
            .all()
        )
        pending_ids = {m.id for m in pending}

        # Build messages array with correct roles — multi-turn structure preserved
        decision_messages: list[dict[str, str]] = []

        for m in all_msgs:
            if m.id in pending_ids:
                # Mark unread messages so LLM knows they're new
                decision_messages.append({
                    "role": m.role,
                    "content": f"[NEW] {m.content}",
                })
            else:
                decision_messages.append({
                    "role": m.role,
                    "content": m.content,
                })

        # Final instruction: ask LLM to decide
        decision_messages.append({
            "role": "user",
            "content": (
                'The messages marked [NEW] above are new from the user. '
                'Decide: REPLY now or WAIT for more?\n'
                'Respond with ONLY the JSON (no markdown fences):\n'
                '{"action":"reply","messages":[{"content":"msg1"},{"content":"msg2"}]}\n'
                'or: {"action":"wait"}'
            ),
        })

        # Create Turn
        turn_count = db.query(Turn).filter(Turn.chat_id == self.chat_id).count()
        turn = Turn(
            chat_id=self.chat_id,
            turn_number=turn_count + 1,
            turn_type="reply",  # May change to "wait" below
        )
        db.add(turn)
        db.flush()

        # Call LLM
        provider = create_provider(
            provider_name=effective.provider,
            api_key=effective.api_key,
            base_url=effective.base_url,
            model=effective.model,
        )

        import asyncio

        loop = asyncio.new_event_loop()
        try:
            llm_result = loop.run_until_complete(
                provider.chat(
                    messages=decision_messages,
                    system_prompt=system_prompt,
                    temperature=effective.temperature,
                    max_tokens=effective.max_tokens,
                )
            )
        finally:
            loop.close()

        # Store raw request / response
        self._save_debug_data(db, turn, provider, llm_result)

        # Parse decision
        decision = self._parse_decision(llm_result.assistant_text)

        if decision.get("action") == "reply":
            turn.turn_type = "reply"
            max_reply = cfg.get("max_reply", 5) if cfg else 5
            self._save_reply(db, pending, turn, decision.get("messages", []), max_reply)
        else:
            turn.turn_type = "wait"
            # Messages stay pending (turn_id remains NULL)

    def _force_reply(self, db, pending: list[Message], oldest_age: float, cfg: dict | None = None):
        """Force a reply — safety valve when limits are exceeded."""
        if cfg is None:
            cfg = _get_config(db)
        reason = (
            f"{len(pending)} pending messages (max {cfg['max_pending']})"
            if len(pending) >= cfg["max_pending"]
            else f"oldest message is {oldest_age:.0f}s old (max wait {cfg['max_wait']}s)"
        )

        chat = db.query(Chat).filter(Chat.id == self.chat_id).first()
        if not chat:
            return

        effective = get_effective_settings(db, self.chat_id)

        # System prompt: chat's prompt (no decision instructions needed for forced reply)
        system_prompt = self._build_decision_system_prompt(db, chat, effective)

        # Build messages with correct multi-turn roles.
        # Get all messages, separated into acknowledged vs pending.
        all_msgs = (
            db.query(Message)
            .filter(Message.chat_id == self.chat_id)
            .order_by(Message.sequence_num)
            .all()
        )
        pending_ids = {m.id for m in pending}

        messages_for_llm: list[dict[str, str]] = []
        for m in all_msgs:
            if m.id in pending_ids:
                messages_for_llm.append({
                    "role": m.role,
                    "content": f"[NEW] {m.content}",
                })
            else:
                messages_for_llm.append({
                    "role": m.role,
                    "content": m.content,
                })

        # Create Turn
        turn_count = db.query(Turn).filter(Turn.chat_id == self.chat_id).count()
        turn = Turn(
            chat_id=self.chat_id,
            turn_number=turn_count + 1,
            turn_type="force_reply",
        )
        db.add(turn)
        db.flush()

        # Link pending messages
        for msg in pending:
            msg.turn_id = turn.id

        # Call LLM
        provider = create_provider(
            provider_name=effective.provider,
            api_key=effective.api_key,
            base_url=effective.base_url,
            model=effective.model,
        )

        import asyncio

        loop = asyncio.new_event_loop()
        try:
            llm_result = loop.run_until_complete(
                provider.chat(
                    messages=messages_for_llm,
                    system_prompt=system_prompt,
                    temperature=effective.temperature,
                    max_tokens=effective.max_tokens,
                )
            )
        finally:
            loop.close()

        # Store debug data
        self._save_debug_data(db, turn, provider, llm_result)

        # Save assistant message
        seq = get_next_sequence(db, self.chat_id)
        am = Message(
            chat_id=self.chat_id,
            role="assistant",
            content=llm_result.assistant_text,
            turn_id=turn.id,
            sequence_num=seq,
        )
        db.add(am)

        logger.info(
            "Force reply for chat %s (%s) — generated 1 message",
            self.chat_id,
            reason,
        )

    # ── Helpers ──────────────────────────────────────────────────────

    def _build_decision_system_prompt(self, db, chat, effective) -> str:
        """Build the system prompt for the decision LLM call."""
        from app.models.settings import AgentFile

        base = chat.system_prompt if chat.system_prompt else effective.system_prompt

        agent_file = db.query(AgentFile).filter(AgentFile.chat_id == chat.id).first()
        if agent_file and agent_file.content:
            base += f"\n\n---\nAdditional context:\n\n{agent_file.content}"

        return base

    def _save_debug_data(self, db, turn, provider, llm_result):
        """Save RawRequest and RawResponse for a turn."""
        raw_req = RawRequest(
            turn_id=turn.id,
            provider=provider.provider_name(),
            endpoint_url=provider.endpoint_url(),
            request_json=json.dumps(
                llm_result.raw_request, indent=2, ensure_ascii=False
            ),
        )
        db.add(raw_req)

        raw_resp = RawResponse(
            turn_id=turn.id,
            provider=provider.provider_name(),
            response_json=json.dumps(
                llm_result.raw_response, indent=2, ensure_ascii=False
            ),
            http_status_code=llm_result.http_status,
            latency_ms=llm_result.latency_ms,
            token_usage_json=json.dumps(llm_result.token_usage)
            if llm_result.token_usage
            else None,
        )
        db.add(raw_resp)

    def _save_reply(
        self,
        db,
        pending: list[Message],
        turn: Turn,
        reply_messages: list[dict],
        max_reply: int = 5,
    ):
        """Save assistant reply messages and link pending user messages to the turn."""
        # Link pending messages to this turn
        for msg in pending:
            msg.turn_id = turn.id

        # Save assistant messages
        seq = get_next_sequence(db, self.chat_id)
        for i, rmsg in enumerate(reply_messages[:max_reply]):
            content = rmsg.get("content", "") if isinstance(rmsg, dict) else str(rmsg)
            if not content.strip():
                continue
            am = Message(
                chat_id=self.chat_id,
                role="assistant",
                content=content,
                turn_id=turn.id,
                sequence_num=seq + i,
            )
            db.add(am)

        logger.info(
            "DecisionLoop reply for chat %s — %d user msg(s) → %d assistant msg(s)",
            self.chat_id,
            len(pending),
            min(len(reply_messages), max_reply),
        )

    @staticmethod
    def _parse_decision(text: str) -> dict:
        """Parse the LLM's JSON decision response.

        Returns a dict with 'action' ('reply'|'wait') and optionally 'messages'.
        Falls back to treating the entire text as a single reply.
        """
        if not text:
            return {"action": "wait"}

        text = text.strip()

        # Strip markdown code fences if present
        if text.startswith("```"):
            lines = text.split("\n")
            # Remove opening fence
            text = "\n".join(lines[1:]) if len(lines) > 1 else ""
            # Remove closing fence
            if text.rstrip().endswith("```"):
                text = text.rstrip()[:-3].strip()

        try:
            decision = json.loads(text)
            if isinstance(decision, dict) and "action" in decision:
                return decision
        except (json.JSONDecodeError, ValueError):
            pass

        # Try to find JSON in the response (sometimes LLM adds preamble)
        import re

        m = re.search(r"\{[^{}]*\"action\"[^{}]*\}", text, re.DOTALL)
        if m:
            try:
                decision = json.loads(m.group())
                if isinstance(decision, dict) and "action" in decision:
                    return decision
            except (json.JSONDecodeError, ValueError):
                pass

        # Fallback: treat the entire response as a single reply
        logger.warning(
            "Could not parse decision JSON, falling back to single reply. Text: %.200s",
            text,
        )
        return {
            "action": "reply",
            "messages": [{"content": text}],
        }


# ── Manager ───────────────────────────────────────────────────────────


class DecisionLoopManager:
    """Singleton manager for per-chat DecisionLoop instances."""

    _loops: dict[str, DecisionLoop] = {}

    @classmethod
    def get_or_create(cls, chat_id: str) -> DecisionLoop:
        """Get or create the DecisionLoop for a chat. Starts it on creation."""
        if chat_id not in cls._loops:
            loop = DecisionLoop(chat_id)
            loop.start()
            cls._loops[chat_id] = loop
            logger.info(
                "DecisionLoopManager: created loop for chat %s (%d active)",
                chat_id,
                len(cls._loops),
            )
        return cls._loops[chat_id]

    @classmethod
    def signal(cls, chat_id: str):
        """Signal that a new message arrived in the given chat."""
        loop = cls.get_or_create(chat_id)
        loop.signal()

    @classmethod
    def stop(cls, chat_id: str):
        """Stop and remove the decision loop for a chat."""
        loop = cls._loops.pop(chat_id, None)
        if loop:
            loop.stop()
            logger.info(
                "DecisionLoopManager: stopped loop for chat %s (%d active)",
                chat_id,
                len(cls._loops),
            )

    @classmethod
    def stop_all(cls):
        """Stop all decision loops (e.g., on server shutdown)."""
        for chat_id in list(cls._loops.keys()):
            cls.stop(chat_id)

    @classmethod
    def active_count(cls) -> int:
        return len(cls._loops)
