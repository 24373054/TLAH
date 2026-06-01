import json

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.debug import RawRequest, RawResponse


def get_raw_request(db: Session, turn_id: str) -> RawRequest:
    req = db.query(RawRequest).filter(RawRequest.turn_id == turn_id).first()
    if req is None:
        raise HTTPException(status_code=404, detail="Raw request not found for this turn")
    return req


def get_raw_response(db: Session, turn_id: str) -> RawResponse:
    resp = db.query(RawResponse).filter(RawResponse.turn_id == turn_id).first()
    if resp is None:
        raise HTTPException(status_code=404, detail="Raw response not found for this turn")
    return resp
