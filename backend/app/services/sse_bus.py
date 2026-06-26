"""
Thread-safe SSE event bus — bridges DecisionLoop (thread) to FastAPI (async).

DecisionLoop pushes events from its background thread; the FastAPI SSE
endpoint reads them as an async generator.
"""

import asyncio
import json
import logging
import threading
from collections.abc import AsyncGenerator

logger = logging.getLogger(__name__)


class SseBus:
    """Singleton per-chat event bus for Server-Sent Events."""

    _queues: dict[str, asyncio.Queue] = {}
    _lock = threading.Lock()
    _main_loop: asyncio.AbstractEventLoop | None = None

    @classmethod
    def set_event_loop(cls, loop: asyncio.AbstractEventLoop):
        """Store the main event loop reference. Called on startup."""
        cls._main_loop = loop

    # ── Public API ──────────────────────────────────────────────────

    @classmethod
    def push(cls, chat_id: str, event_type: str, data: dict | None = None):
        """Thread-safe: push an event from any thread.

        Called from DecisionLoop (background thread) to notify the
        frontend via SSE.
        """
        queue = cls._get_or_create_queue(chat_id)
        payload = json.dumps({"event": event_type, "data": data or {}})
        loop = cls._main_loop
        if loop and loop.is_running():
            loop.call_soon_threadsafe(queue.put_nowait, payload)

    @classmethod
    async def events(cls, chat_id: str) -> AsyncGenerator[str, None]:
        """Async generator: yields SSE-formatted events for a chat.

        Used by the SSE endpoint. Stays open until the client disconnects.
        """
        queue = cls._get_or_create_queue(chat_id)
        while True:
            try:
                # Wait up to 30s for an event, then send a heartbeat
                payload = await asyncio.wait_for(queue.get(), timeout=3.0)
                data = json.loads(payload)
                event_type = data.get("event", "message")
                event_data = json.dumps(data.get("data", {}))
                yield f"event: {event_type}\ndata: {event_data}\n\n"
            except asyncio.TimeoutError:
                # Heartbeat to keep connection alive
                yield ": heartbeat\n\n"

    @classmethod
    def close(cls, chat_id: str):
        """Remove the queue for a chat (client disconnected)."""
        with cls._lock:
            if chat_id in cls._queues:
                del cls._queues[chat_id]
                logger.debug("SSE bus closed for chat %s", chat_id)

    # ── Internal ────────────────────────────────────────────────────

    @classmethod
    def _get_or_create_queue(cls, chat_id: str) -> asyncio.Queue:
        with cls._lock:
            if chat_id not in cls._queues:
                cls._queues[chat_id] = asyncio.Queue(maxsize=256)
            return cls._queues[chat_id]
