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

# ── Agent prompt ───────────────────────────────────────────────────────

AGENT_SYSTEM_PROMPT = """[SANDBOX ENVIRONMENT]
You have access to a Linux sandbox (Ubuntu 24.04). You can execute shell
commands to complete tasks. The workspace is /workspace.

Pre-installed tools:
- python3 + pip3 (pip install works normally)
- node (v22) + npm
- git, curl, wget
- gcc, g++, make, cmake
- jq, vim, zip, unzip, file

Available action (in addition to "reply" and "wait"):
{"action":"tool_call","tool":"shell","command":"<shell command>","description":"<what this does>"}

Rules:
- Work iteratively: run a command, analyze the output, decide next step
- When the task is complete, use "reply" to respond to the user
- You may chain multiple tool calls before replying (max 10 iterations)
- Every command runs in isolation — state persists in /workspace
- Commands timeout after 30 seconds
- Network access is enabled — you can pip install, npm install, git clone, etc.

[CRITICAL — OUTPUT FORMAT]
You MUST respond with ONLY a raw JSON object. Never use XML tags like
<function_calls> or <invoke>. The ONLY valid formats are JSON:

{"action":"reply","messages":[{"content":"msg1"},{"content":"msg2"}]}
{"action":"wait"}
{"action":"tool_call","tool":"shell","command":"the command","description":"what it does"}

CRITICAL: In shell commands, use SINGLE QUOTES (') for quoting, never
double quotes ("). Example: use  grep -E 'pattern'  not  grep -E \"pattern\".
Double quotes inside the JSON command value will BREAK the JSON parser.

Do NOT output any text before or after the JSON — not even a single word
of reasoning or explanation. Your ENTIRE response must be parseable as JSON.
Do NOT use XML. Do NOT wrap in markdown code fences.

When replying after generating files, include an optional "files" array
to share files with the user:
{"action":"reply","messages":[...],"files":["/workspace/image.png"]}
Images (png/jpg/gif/svg/webp) appear as previews; others as downloads."""

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
- Do NOT wrap the JSON in markdown code blocks
- Do NOT use XML tags like <function_calls>. Use ONLY JSON."""

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

            # Check if agent mode is enabled for this chat
            chat = db.query(Chat).filter(Chat.id == self.chat_id).first()
            is_agent = chat.agent_enabled if chat else False
            max_iterations = chat.agent_max_iterations if chat else 10

            # Check safety limits
            oldest_age = (
                datetime.now(timezone.utc) - pending[0].created_at.replace(tzinfo=timezone.utc)
            ).total_seconds()
            force = (
                len(pending) >= cfg["max_pending"]
                or oldest_age >= cfg["max_wait"]
            )

            if is_agent:
                self._process_agent(db, pending, cfg, max_iterations, force)
            elif force:
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
            role = m.role if m.role in ("user", "assistant", "system") else "user"
            if m.id in pending_ids:
                # Mark unread messages so LLM knows they're new
                decision_messages.append({
                    "role": role,
                    "content": f"[NEW] {m.content}",
                })
            else:
                decision_messages.append({
                    "role": role,
                    "content": m.content,
                })

        # Final instruction: ask LLM to decide
        decision_messages.append({
            "role": "user",
            "content": (
                'The messages marked [NEW] above are new from the user. '
                'Decide: REPLY now or WAIT for more?\n'
                'Respond with ONLY the JSON (no text, no reasoning, no markdown):\n'
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
            self._save_reply(
                db, pending, turn, decision.get("messages", []), max_reply,
                files=decision.get("files"),
            )
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
            role = m.role if m.role in ("user", "assistant", "system") else "user"
            if m.id in pending_ids:
                messages_for_llm.append({
                    "role": role,
                    "content": f"[NEW] {m.content}",
                })
            else:
                suffix = ""
                if m.message_type == "sandbox_call":
                    suffix = "[SANDBOX COMMAND] "
                elif m.message_type == "sandbox_result":
                    suffix = "[SANDBOX OUTPUT] "
                messages_for_llm.append({
                    "role": role,
                    "content": suffix + m.content,
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
        files: list[str] | None = None,
    ):
        """Save assistant reply messages and link pending user messages to the turn."""
        # Link pending messages to this turn
        for msg in pending:
            msg.turn_id = turn.id

        # Save assistant messages
        seq = get_next_sequence(db, self.chat_id)
        last_msg = None
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
            last_msg = am

        # Attach files to the last assistant message
        if files and last_msg:
            file_urls = []
            for f in files:
                fname = f.replace("/workspace/", "").lstrip("/")
                file_urls.append(f"/api/chats/{self.chat_id}/files/{fname}")
            last_msg.metadata_json = json.dumps({"files": files, "file_urls": file_urls})

        logger.info(
            "DecisionLoop reply for chat %s — %d user msg(s) → %d assistant msg(s)",
            self.chat_id,
            len(pending),
            min(len(reply_messages), max_reply),
        )

    # ── Agent loop ────────────────────────────────────────────────────

    def _process_agent(
        self,
        db,
        pending: list[Message],
        cfg: dict,
        max_iterations: int,
        force: bool,
    ):
        """Agent mode: iterative loop with tool calling.

        The LLM can request tool calls (shell commands) in addition to
        wait/reply. Each tool call is executed in the sandbox and the
        result is fed back to the LLM for the next decision.

        Each LLM call creates a Turn (parent_turn chain) for full debug data.
        """
        import asyncio

        from app.services.sandbox import SandboxManager, SandboxResult

        chat = db.query(Chat).filter(Chat.id == self.chat_id).first()
        if not chat:
            return

        effective = get_effective_settings(db, self.chat_id)

        # Build the base system prompt with agent instructions
        base_system = self._build_decision_system_prompt(db, chat, effective)
        system_prompt = base_system + "\n\n" + AGENT_SYSTEM_PROMPT

        if force:
            system_prompt += "\n\n[NOTE] Safety limit reached — please reply now."

        # Get all existing messages
        all_msgs = (
            db.query(Message)
            .filter(Message.chat_id == self.chat_id)
            .order_by(Message.sequence_num)
            .all()
        )
        pending_ids = {m.id for m in pending}

        # Build initial messages array — sandbox messages mapped to "user" for API compat
        messages_for_llm: list[dict[str, str]] = []
        for m in all_msgs:
            role = m.role if m.role in ("user", "assistant", "system") else "user"
            if m.id in pending_ids:
                messages_for_llm.append({
                    "role": role,
                    "content": f"[NEW] {m.content}",
                })
            else:
                # Sandbox messages get a prefix so the LLM can distinguish them
                if m.message_type == "sandbox_call":
                    messages_for_llm.append({
                        "role": role,
                        "content": f"[SANDBOX COMMAND] {m.content}",
                    })
                elif m.message_type == "sandbox_result":
                    messages_for_llm.append({
                        "role": role,
                        "content": f"[SANDBOX OUTPUT] {m.content}",
                    })
                else:
                    messages_for_llm.append({
                        "role": role,
                        "content": m.content,
                    })

        # Add decision instruction
        messages_for_llm.append({
            "role": "user",
            "content": (
                'The messages marked [NEW] above are new. '
                'You are in agent mode with sandbox access.\n'
                'Decide: REPLY, WAIT, or TOOL_CALL?\n'
                'Respond with ONLY the JSON (no text, no reasoning, no markdown):\n'
                '{"action":"reply","messages":[{"content":"msg"}]}\n'
                'or: {"action":"wait"}\n'
                'or: {"action":"tool_call","tool":"shell",'
                '"command":"<shell command>","description":"<what this does>"}'
            ),
        })

        parent_turn_id: str | None = None
        first_turn = True

        for iteration in range(1, max_iterations + 1):
            # Create Turn
            turn_count = db.query(Turn).filter(Turn.chat_id == self.chat_id).count()
            turn = Turn(
                chat_id=self.chat_id,
                turn_number=turn_count + 1,
                turn_type="reply",
                parent_turn_id=parent_turn_id,
            )
            db.add(turn)
            db.flush()

            if first_turn:
                # Link pending messages to the first turn
                for msg in pending:
                    msg.turn_id = turn.id
                first_turn = False

            # Call LLM (streaming)
            from app.services.sse_bus import SseBus

            provider = create_provider(
                provider_name=effective.provider,
                api_key=effective.api_key,
                base_url=effective.base_url,
                model=effective.model,
            )

            SseBus.push(self.chat_id, "thinking", {})

            thinking_buffer: list[str] = []
            text_buffer: list[str] = []
            loop = asyncio.new_event_loop()
            try:
                async def _stream_tokens():
                    async for token in provider.chat_stream(
                        messages=messages_for_llm,
                        system_prompt=system_prompt,
                        temperature=effective.temperature,
                        max_tokens=effective.max_tokens,
                    ):
                        if token.startswith("\x01"):
                            # Thinking token (strip prefix for display)
                            clean = token[1:]
                            thinking_buffer.append(clean)
                            SseBus.push(self.chat_id, "token", {"text": clean})
                        else:
                            text_buffer.append(token)
                            SseBus.push(self.chat_id, "token", {"text": token})
                loop.run_until_complete(_stream_tokens())
            finally:
                loop.close()

            full_text = "".join(text_buffer)
            thinking_text = "".join(thinking_buffer) if thinking_buffer else None

            # Store debug data
            from app.models.debug import RawRequest as RR, RawResponse as RS

            raw_req = RR(
                turn_id=turn.id,
                provider=provider.provider_name(),
                endpoint_url=provider.endpoint_url(),
                request_json=json.dumps({
                    "model": effective.model,
                    "messages": messages_for_llm,
                    "stream": True,
                }, indent=2, ensure_ascii=False),
            )
            db.add(raw_req)

            content_blocks = []
            if thinking_text:
                content_blocks.append({"type": "thinking", "thinking": thinking_text})
            content_blocks.append({"type": "text", "text": full_text})

            raw_resp = RS(
                turn_id=turn.id,
                provider=provider.provider_name(),
                response_json=json.dumps({
                    "model": effective.model,
                    "streamed": True,
                    "content": content_blocks,
                    "note": "Streaming mode — thinking and text tokens captured separately.",
                }, indent=2, ensure_ascii=False),
                http_status_code=200,
                latency_ms=0,
            )
            db.add(raw_resp)

            # Parse decision
            decision = self._parse_decision(full_text)
            was_fallback = (
                decision.get("action") == "reply"
                and len(decision.get("messages", [])) == 1
                and full_text.strip() == decision["messages"][0]["content"]
                and not full_text.strip().startswith("{")
            )
            if was_fallback and iteration < max_iterations:
                logger.warning(
                    "LLM response was not JSON, asking for correction (iteration %d)", iteration,
                )
                messages_for_llm.append({
                    "role": "user",
                    "content": (
                        "[SYSTEM] Your last response was not valid JSON. "
                        "You MUST respond with ONLY a JSON object. No reasoning, "
                        "no markdown, no text — ONLY the JSON. "
                        'Example: {"action":"tool_call","tool":"shell",'
                        '"command":"ls","description":"list files"}'
                    ),
                })
                parent_turn_id = turn.id
                continue

            action = decision.get("action", "reply")

            if action == "wait":
                turn.turn_type = "wait"
                if first_turn is False and parent_turn_id is None:
                    for msg in pending:
                        msg.turn_id = None
                SseBus.push(self.chat_id, "done", {})
                logger.info("Agent wait for chat %s (iteration %d)", self.chat_id, iteration)
                return

            if action == "reply":
                turn.turn_type = "reply"
                max_reply = cfg.get("max_reply", 5)
                self._save_reply(
                    db, [], turn,
                    decision.get("messages", [{"content": full_text}]),
                    max_reply,
                    files=decision.get("files"),
                )
                SseBus.push(self.chat_id, "done", {})
                logger.info(
                    "Agent reply for chat %s (iteration %d)",
                    self.chat_id, iteration,
                )
                return

            if action == "tool_call":
                turn.turn_type = "reply"  # Keep as reply type for UI grouping
                command = decision.get("command", "")
                description = decision.get("description", "")
                tool_name = decision.get("tool", "shell")

                if not command:
                    # Empty command — treat as error, feed back to LLM
                    messages_for_llm.append({
                        "role": "user",
                        "content": "[SYSTEM] Error: tool_call requires a 'command' field.",
                    })
                    parent_turn_id = turn.id
                    continue

                # Save the tool call message
                seq = get_next_sequence(db, self.chat_id)
                call_msg = Message(
                    chat_id=self.chat_id,
                    role="sandbox",
                    content=command,
                    turn_id=turn.id,
                    sequence_num=seq,
                    message_type="sandbox_call",
                    metadata_json=json.dumps({
                        "tool": tool_name,
                        "command": command,
                        "description": description,
                    }),
                )
                db.add(call_msg)
                SseBus.push(self.chat_id, "sandbox_call", {
                    "command": command,
                    "description": description,
                })

                # Ensure sandbox container exists
                try:
                    loop2 = asyncio.new_event_loop()
                    try:
                        loop2.run_until_complete(
                            SandboxManager.ensure_container(self.chat_id, db_session=db)
                        )
                    finally:
                        loop2.close()
                except Exception as e:
                    logger.error("Sandbox ensure_container failed: %s", e)
                    result = SandboxResult(
                        stdout="",
                        stderr=str(e),
                        exit_code=-1,
                        duration_ms=0,
                        error=f"Failed to start sandbox: {e}",
                    )
                    messages_for_llm.append({
                        "role": "user",
                        "content": f"[SYSTEM] Sandbox error: {e}",
                    })
                    parent_turn_id = turn.id
                    continue
                else:
                    # Execute command
                    try:
                        loop3 = asyncio.new_event_loop()
                        try:
                            result = loop3.run_until_complete(
                                SandboxManager.execute(self.chat_id, command)
                            )
                        finally:
                            loop3.close()
                    except Exception as e:
                        logger.error("Sandbox execute failed: %s", e)
                        result = SandboxResult(
                            stdout="",
                            stderr=str(e),
                            exit_code=-1,
                            duration_ms=0,
                            error=str(e),
                        )

                # Format result for display
                result_text = result.stdout
                if result.stderr:
                    result_text += f"\n[stderr]\n{result.stderr}"
                if result.error:
                    result_text += f"\n[error] {result.error}"
                result_text += f"\nExit code: {result.exit_code} ({result.duration_ms}ms)"

                # Save tool result message
                seq2 = get_next_sequence(db, self.chat_id)
                result_msg = Message(
                    chat_id=self.chat_id,
                    role="sandbox",
                    content=result_text.strip() or "(no output)",
                    turn_id=turn.id,
                    sequence_num=seq2,
                    message_type="sandbox_result",
                    metadata_json=json.dumps({
                        "exit_code": result.exit_code,
                        "stdout": result.stdout,
                        "stderr": result.stderr,
                        "duration_ms": result.duration_ms,
                    }),
                )
                db.add(result_msg)
                SseBus.push(self.chat_id, "sandbox_result", {
                    "exit_code": result.exit_code,
                    "output": result_text.strip() or "(no output)",
                    "duration_ms": result.duration_ms,
                })

                # Feed result back to LLM for next iteration
                messages_for_llm.append({
                    "role": "user",
                    "content": (
                        f"[TOOL RESULT] Command: {command}\n"
                        f"Output:\n{result_text}\n\n"
                        "Decide next step: reply, wait, or another tool_call?"
                    ),
                })

                # Continue loop
                parent_turn_id = turn.id
                logger.info(
                    "Agent tool_call for chat %s (iteration %d): %s → exit %d",
                    self.chat_id, iteration, command[:80], result.exit_code,
                )
                continue

            # Unknown action — treat as reply
            logger.warning(
                "Unknown agent action '%s', treating as reply", action,
            )
            turn.turn_type = "reply"
            self._save_reply(
                db, [], turn,
                [{"content": full_text}],
                cfg.get("max_reply", 5),
                files=decision.get("files"),
            )
            return

        # Max iterations exceeded — force final reply
        logger.warning(
            "Agent max iterations (%d) reached for chat %s, forcing reply",
            max_iterations, self.chat_id,
        )
        self._force_reply(db, pending, 0, cfg)

    @staticmethod
    def _parse_decision(text: str) -> dict:
        """Parse the LLM's JSON decision response.

        Handles: valid JSON, JSON in markdown fences, JSON with preamble,
        XML/function-calling format, and common JSON errors (unescaped quotes).
        Falls back to treating the entire text as a single reply.
        """
        import re

        if not text:
            return {"action": "wait"}

        text = text.strip()

        # Strip markdown code fences if present
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:]) if len(lines) > 1 else ""
            if text.rstrip().endswith("```"):
                text = text.rstrip()[:-3].strip()
            text = text.strip()

        # ── Attempt 1: direct JSON parse ────────────────────────────
        try:
            decision = json.loads(text)
            if isinstance(decision, dict) and "action" in decision:
                return decision
        except (json.JSONDecodeError, ValueError):
            pass

        # ── Attempt 2: extract {…} block via brace matching ─────────
        # Find ALL positions of {"action" and try parsing each (last one first,
        # since LLMs tend to put reasoning before the actual JSON).
        import re as _re2

        action_starts = [m.start() for m in _re2.finditer(r'\{\s*"action"\s*:', text)]
        # Try last match first (LLM puts reasoning before JSON)
        for start in reversed(action_starts):
            depth = 0
            in_string = False
            escape_next = False
            for i in range(start, len(text)):
                ch = text[i]
                if escape_next:
                    escape_next = False
                    continue
                if ch == "\\":
                    escape_next = True
                    continue
                if ch == '"' and not escape_next:
                    in_string = not in_string
                    continue
                if in_string:
                    continue
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        candidate = text[start:i+1]
                        try:
                            decision = json.loads(candidate)
                            if isinstance(decision, dict) and "action" in decision:
                                return decision
                        except (json.JSONDecodeError, ValueError):
                            fixed = _fix_json_quotes(candidate)
                            if fixed:
                                try:
                                    decision = json.loads(fixed)
                                    if isinstance(decision, dict) and "action" in decision:
                                        logger.info("Parsed JSON after quote fix")
                                        return decision
                                except (json.JSONDecodeError, ValueError):
                                    pass
                        break

        # ── Attempt 3: regex fallback (simple flat JSON) ─────────────
        m = re.search(r"\{[^{}]*\"action\"[^{}]*\}", text, re.DOTALL)
        if m:
            try:
                decision = json.loads(m.group())
                if isinstance(decision, dict) and "action" in decision:
                    return decision
            except (json.JSONDecodeError, ValueError):
                pass

        # ── Attempt 4: XML/function-calling format ───────────────────
        if "<function_calls>" in text or "<invoke" in text:
            cmd_match = re.search(
                r'<parameter\s+name="command"[^>]*>(.*?)</parameter>',
                text, re.DOTALL,
            )
            desc_match = re.search(
                r'<parameter\s+name="description"[^>]*>(.*?)</parameter>',
                text, re.DOTALL,
            )
            if cmd_match:
                command = cmd_match.group(1).strip()
                description = desc_match.group(1).strip() if desc_match else ""
                logger.info("Parsed tool_call from XML format: %.100s", command)
                return {
                    "action": "tool_call",
                    "tool": "shell",
                    "command": command,
                    "description": description,
                }

        # ── Fallback: treat as text reply ───────────────────────────
        logger.warning(
            "Could not parse decision JSON, falling back to single reply. Text: %.200s",
            text,
        )
        return {
            "action": "reply",
            "messages": [{"content": text}],
        }


def _fix_json_quotes(text: str) -> str | None:
    """Attempt to fix unescaped double-quotes inside JSON string values.

    For badly-formed JSON like:
      {"action":"tool_call","command":"echo "hello"","description":"x"}
    we try to produce:
      {"action":"tool_call","command":"echo \"hello\"","description":"x"}

    Strategy: find the "command" field (the most likely to contain unescaped
    quotes) and brute-force escape inner double quotes within it.
    """
    import re as _re

    # Locate "command":"..." — the value runs until ",description" or "}
    m = _re.search(
        r'"command"\s*:\s*"(.*?)"\s*,\s*"description"',
        text, _re.DOTALL,
    )
    if m:
        cmd_value = m.group(1)
        # Escape any unescaped double-quotes inside the command value
        fixed_cmd = _re.sub(r'(?<!\\)"', r'\\"', cmd_value)
        if fixed_cmd != cmd_value:
            before = text[:m.start(1)]
            after = text[m.end(1):]
            return before + fixed_cmd + after

    return None


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
