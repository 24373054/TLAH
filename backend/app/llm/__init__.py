from app.llm.base import LLMProvider, LLMResponse
from app.llm.openai_compat import OpenAICompatibleProvider
from app.llm.anthropic_provider import AnthropicProvider


def create_provider(
    provider_name: str,
    api_key: str,
    base_url: str | None = None,
    model: str | None = None,
) -> LLMProvider:
    """Factory: return the right LLMProvider implementation."""
    match provider_name:
        case "anthropic":
            return AnthropicProvider(
                api_key=api_key,
                base_url=base_url or "https://api.anthropic.com",
                model=model or "claude-sonnet-4-6",
            )
        case _:
            # openai, deepseek, openai_compat, or any OpenAI-compatible API
            return OpenAICompatibleProvider(
                api_key=api_key,
                base_url=base_url or "https://api.openai.com",
                model=model or "gpt-4o",
            )


__all__ = [
    "LLMProvider",
    "LLMResponse",
    "OpenAICompatibleProvider",
    "AnthropicProvider",
    "create_provider",
]
