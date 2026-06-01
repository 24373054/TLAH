import json
from datetime import datetime

from pydantic import BaseModel, field_validator


class RawRequestResponse(BaseModel):
    id: str
    turn_id: str
    provider: str
    endpoint_url: str
    request_json: dict  # Parsed JSON
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("request_json", mode="before")
    @classmethod
    def parse_json(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v


class RawResponseResponse(BaseModel):
    id: str
    turn_id: str
    provider: str
    response_json: dict  # Parsed JSON
    http_status_code: int
    latency_ms: int
    token_usage_json: dict | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("response_json", "token_usage_json", mode="before")
    @classmethod
    def parse_json(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v
