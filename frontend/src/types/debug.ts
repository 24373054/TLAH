export interface RawRequestData {
  id: string;
  turn_id: string;
  provider: string;
  endpoint_url: string;
  request_json: Record<string, unknown>;
  created_at: string;
}

export interface RawResponseData {
  id: string;
  turn_id: string;
  provider: string;
  response_json: Record<string, unknown>;
  http_status_code: number;
  latency_ms: number;
  token_usage_json: Record<string, number> | null;
  created_at: string;
}
