import json
import time
from typing import Any

import httpx

from app.llm.base import LLMProvider, LLMResponse


class OpenAICompatibleProvider(LLMProvider):
    """Calls any OpenAI-compatible chat completions API via raw httpx.

    This includes OpenAI, DeepSeek, and any other provider that
    implements the POST /v1/chat/completions contract.

    We use httpx directly — NOT the openai SDK — so that we can capture
    the exact request/response JSON for the debug panel.
    """

    def __init__(self, api_key: str, base_url: str, model: str):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model

    def provider_name(self) -> str:
        return "openai_compat"

    def endpoint_url(self) -> str:
        return f"{self._base_url}/v1/chat/completions"

    async def chat(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> LLMResponse:
        # Build the full messages array with system prompt first
        full_messages = [{"role": "system", "content": system_prompt}]
        full_messages.extend(messages)

        raw_request: dict[str, Any] = {
            "model": self._model,
            "messages": full_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        headers = {
            "Authorization": f"Bearer {self._api_key}",
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

        # Extract assistant text
        assistant_text = ""
        token_usage = None
        error = None

        if response.is_success:
            try:
                choices = raw_response.get("choices", [])
                if choices:
                    assistant_text = choices[0].get("message", {}).get("content", "")
                usage = raw_response.get("usage")
                if usage:
                    token_usage = {
                        "prompt_tokens": usage.get("prompt_tokens", 0),
                        "completion_tokens": usage.get("completion_tokens", 0),
                        "total_tokens": usage.get("total_tokens", 0),
                    }
            except Exception as e:
                error = f"Failed to extract response: {e}"
                assistant_text = f"[Error extracting response: {e}]"
        else:
            error = raw_response.get("error", {}).get("message", response.text)
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
