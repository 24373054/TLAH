from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.settings import ChatSettings, GlobalSettings
from app.schemas.settings import ChatSettingsUpdate, GlobalSettingsUpdate


def _mask_api_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "*" * len(key)
    return key[:4] + "*" * (len(key) - 8) + key[-4:]


def get_global_settings(db: Session) -> GlobalSettings:
    gs = db.query(GlobalSettings).filter(GlobalSettings.id == 1).first()
    if gs is None:
        gs = GlobalSettings(id=1)
        db.add(gs)
        db.commit()
        db.refresh(gs)
    return gs


def get_global_settings_masked(db: Session) -> dict:
    gs = get_global_settings(db)
    return {
        "provider": gs.provider,
        "api_key": _mask_api_key(gs.api_key),
        "base_url": gs.base_url,
        "model": gs.model,
        "temperature": gs.temperature,
        "max_tokens": gs.max_tokens,
        "system_prompt": gs.system_prompt,
        "user_role": gs.user_role,
        "debounce_seconds": gs.debounce_seconds,
        "max_pending_messages": gs.max_pending_messages,
        "max_wait_seconds": gs.max_wait_seconds,
        "max_reply_messages": gs.max_reply_messages,
    }


def get_global_settings_raw(db: Session) -> GlobalSettings:
    """Returns the global settings with unmasked API key for internal use."""
    return get_global_settings(db)


def _is_masked(value: str) -> bool:
    """True if the value looks like the masked API key (contains * characters)."""
    return "*" in value


def update_global_settings(db: Session, data: GlobalSettingsUpdate) -> GlobalSettings:
    gs = get_global_settings(db)
    for field, value in data.model_dump(exclude_unset=True).items():
        # Never overwrite API key with the masked version sent back from the frontend
        if field == "api_key" and isinstance(value, str) and _is_masked(value):
            continue
        setattr(gs, field, value)
    db.commit()
    db.refresh(gs)
    return gs


def get_chat_settings(db: Session, chat_id: str) -> ChatSettings | None:
    return db.query(ChatSettings).filter(ChatSettings.chat_id == chat_id).first()


def get_or_create_chat_settings(db: Session, chat_id: str) -> ChatSettings:
    cs = get_chat_settings(db, chat_id)
    if cs is None:
        cs = ChatSettings(chat_id=chat_id)
        db.add(cs)
        db.commit()
        db.refresh(cs)
    return cs


def update_chat_settings(db: Session, chat_id: str, data: ChatSettingsUpdate) -> ChatSettings:
    cs = get_or_create_chat_settings(db, chat_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "api_key" and isinstance(value, str) and _is_masked(value):
            continue
        setattr(cs, field, value)
    db.commit()
    db.refresh(cs)
    return cs


@dataclass
class EffectiveSettings:
    """The actual settings used for an LLM call — merged from global + chat override."""
    provider: str
    api_key: str
    base_url: str
    model: str
    temperature: float
    max_tokens: int
    system_prompt: str
    user_role: str


def get_effective_settings(db: Session, chat_id: str) -> EffectiveSettings:
    gs = get_global_settings_raw(db)
    cs = get_chat_settings(db, chat_id)

    return EffectiveSettings(
        provider=cs.provider if cs and cs.provider else gs.provider,
        api_key=cs.api_key if cs and cs.api_key else gs.api_key,
        base_url=cs.base_url if cs and cs.base_url else gs.base_url,
        model=cs.model if cs and cs.model else gs.model,
        temperature=cs.temperature if cs and cs.temperature is not None else gs.temperature,
        max_tokens=cs.max_tokens if cs and cs.max_tokens is not None else gs.max_tokens,
        system_prompt=gs.system_prompt,
        user_role=cs.user_role if cs and cs.user_role else gs.user_role,
    )
