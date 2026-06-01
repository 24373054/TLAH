from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class LLMResponse:
    """The complete result of an LLM API call — everything needed for debugging."""

    raw_request: dict[str, Any]  # Complete request payload sent over the wire
    raw_response: dict[str, Any]  # Complete response payload received
    http_status: int  # HTTP status code
    latency_ms: int  # Round-trip time in milliseconds
    assistant_text: str  # Extracted assistant message content
    token_usage: dict[str, int] | None = None  # Parsed token usage
    error: str | None = None  # Error message if call failed


class LLMProvider(ABC):
    """Abstract base for LLM API providers.

    We use httpx directly (NOT the official SDKs) so we can capture
    the EXACT request and response JSON at the HTTP layer.
    """

    @abstractmethod
    async def chat(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        """Execute a chat completion.

        Args:
            messages: List of {role, content} dicts (user/assistant pairs only).
            system_prompt: The system prompt to prepend.
            temperature: Sampling temperature.
            max_tokens: Max tokens to generate.

        Returns:
            LLMResponse with the complete raw request, raw response,
            extracted assistant text, timing, and usage data.
        """
        ...

    @abstractmethod
    def provider_name(self) -> str:
        """Return a short name for this provider type."""
        ...

    @abstractmethod
    def endpoint_url(self) -> str:
        """Return the full endpoint URL being called."""
        ...
