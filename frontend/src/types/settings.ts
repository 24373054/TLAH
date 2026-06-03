export interface ProviderInfo {
  key: string;
  name: string;
  default_base_url: string;
  default_model: string;
}

export interface GlobalSettings {
  provider: string;
  api_key: string;
  base_url: string;
  model: string;
  temperature: number;
  max_tokens: number;
  system_prompt: string;
  user_role: string;
}

export interface GlobalSettingsUpdate {
  provider?: string;
  api_key?: string;
  base_url?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  system_prompt?: string;
  user_role?: string;
}

export interface ChatSettings {
  provider: string | null;
  api_key: string | null;
  base_url: string | null;
  model: string | null;
  temperature: number | null;
  max_tokens: number | null;
  user_role: string | null;
}

export interface ChatSettingsUpdate {
  provider?: string | null;
  api_key?: string | null;
  base_url?: string | null;
  model?: string | null;
  temperature?: number | null;
  max_tokens?: number | null;
  user_role?: string | null;
}

export interface AgentFileData {
  id: string;
  chat_id: string;
  filename: string;
  content: string;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}
