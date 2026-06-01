from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.debug import RawRequestResponse, RawResponseResponse
from app.services import debug_service

router = APIRouter(prefix="/turns", tags=["debug"])


@router.get("/{turn_id}/raw-request", response_model=RawRequestResponse)
def get_raw_request(turn_id: str, db: Session = Depends(get_db)):
    """Return the COMPLETE raw HTTP request that was sent to the LLM API.

    This includes the full messages array with system prompt, history,
    and all parameters — exactly as sent over the wire.
    """
    return debug_service.get_raw_request(db, turn_id)


@router.get("/{turn_id}/raw-response", response_model=RawResponseResponse)
def get_raw_response(turn_id: str, db: Session = Depends(get_db)):
    """Return the COMPLETE raw HTTP response received from the LLM API.

    This includes choices array, usage stats, finish_reason, and all
    provider-specific fields — exactly as received over the wire.
    """
    return debug_service.get_raw_response(db, turn_id)
