from fastapi import APIRouter

from app.routers import chats, debug, messages, settings

router = APIRouter(prefix="/api")
router.include_router(chats.router)
router.include_router(messages.router)
router.include_router(debug.router)
router.include_router(settings.router)

__all__ = ["router"]
