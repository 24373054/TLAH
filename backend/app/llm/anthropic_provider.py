import json
import time
from typing import Any

import httpx

from app.llm.base import LLMProvider, LLMResponse


class AnthropicProvider(LLMProvider):
    """Calls the Anthropic Messages API via raw httpx.

    Uses the dedicated `system` top-level field (not injected into messages),
    which is Anthropic's native approach.
    """

    ANTHROPIC_VERSION = "2023-06-01"

    def __init__(self, api_key: str, base_url: str, model: str):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model

    def provider_name(self) -> str:
        return "anthropic"

    def endpoint_url(self) -> str:
        return f"{self._base_url}/v1/messages"

    async def chat(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        # Anthropic uses a separate "system" field (not in messages array)
        raw_request: dict[str, Any] = {
            "model": self._model,
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": messages,
            "temperature": temperature,
        }

        headers = {
            "x-api-key": self._api_key,
            "anthropic-version": self.ANTHROPIC_VERSION,
            "Content-Type": "application/json",
        }

        start = time.monotonic()
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                self.endpoint_url(),
                json=raw_request,
                headers=headers,
            )
        elapsed_ms = int((time.monotonic() - start) * 1000)

        try:
            raw_response = response.json()
        except Exception:
            raw_response = {"_error": "Failed to parse response JSON", "_body": response.text}

        # Extract assistant text from Anthropic's content block format
        assistant_text = ""
        token_usage = None
        error = None

        if response.is_success:
            try:
                content_blocks = raw_response.get("content", [])
                # Collect all text blocks
                text_parts = []
                for block in content_blocks:
                    if block.get("type") == "text":
                        text_parts.append(block.get("text", ""))
                assistant_text = "\n".join(text_parts)

                usage = raw_response.get("usage")
                if usage:
                    token_usage = {
                        "input_tokens": usage.get("input_tokens", 0),
                        "output_tokens": usage.get("output_tokens", 0),
                        "total_tokens": usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
                    }
            except Exception as e:
                error = f"Failed to extract response: {e}"
                assistant_text = f"[Error extracting response: {e}]"
        else:
            error_detail = raw_response.get("error", {}).get("message", response.text)
            error = str(error_detail)
            assistant_text = f"[API Error {response.status_code}: {error}]"

        return LLMResponse(
            raw_request=raw_request,
            raw_response=raw_response,
            http_status=response.status_code,
            latency_ms=elapsed_ms,
            assistant_text=assistant_text,
            token_usage=token_usage,
            error=error,
        )
