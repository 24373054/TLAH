from datetime import datetime

from pydantic import BaseModel


class ProviderInfo(BaseModel):
    key: str
    name: str
    default_base_url: str
    default_model: str


SUPPORTED_PROVIDERS: list[ProviderInfo] = [
    ProviderInfo(
        key="openai",
        name="OpenAI",
        default_base_url="https://api.openai.com",
        default_model="gpt-4o",
    ),
    ProviderInfo(
        key="openai_compat",
        name="OpenAI Compatible",
        default_base_url="https://api.openai.com",
        default_model="gpt-4o",
    ),
    ProviderInfo(
        key="anthropic",
        name="Anthropic",
        default_base_url="https://api.anthropic.com",
        default_model="claude-sonnet-4-6",
    ),
]


class GlobalSettingsResponse(BaseModel):
    provider: str
    api_key: str  # Will be partially masked in service layer
    base_url: str
    model: str
    temperature: float
    max_tokens: int
    system_prompt: str
    user_role: str
    debounce_seconds: float
    max_pending_messages: int
    max_wait_seconds: int
    max_reply_messages: int

    model_config = {"from_attributes": True}


class GlobalSettingsUpdate(BaseModel):
    provider: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    model: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    system_prompt: str | None = None
    user_role: str | None = None
    debounce_seconds: float | None = None
    max_pending_messages: int | None = None
    max_wait_seconds: int | None = None
    max_reply_messages: int | None = None


class ChatSettingsResponse(BaseModel):
    provider: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    model: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    user_role: str | None = None

    model_config = {"from_attributes": True}


class ChatSettingsUpdate(BaseModel):
    provider: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    model: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    user_role: str | None = None


class AgentFileResponse(BaseModel):
    id: str
    chat_id: str
    filename: str
    content: str
    size_bytes: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
