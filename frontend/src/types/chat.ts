export interface ChatSummary {
  id: string;
  title: string;
  updated_at: string;
  message_count: number;
}

export interface Chat {
  id: string;
  title: string;
  system_prompt: string;
  created_at: string;
  updated_at: string;
}

export interface ChatDetail extends Chat {
  messages: Message[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  turn_id: string | null;
  sequence_num: number;
  created_at: string;
}

export interface SendMessageResponse {
  turn_id: string;
  user_message: Message;
  assistant_message: Message;
}
