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

export interface TurnMeta {
  id: string;
  turn_number: number;
  parent_turn_id: string | null;
  turn_type: string; // "reply" | "wait" | "force_reply"
  child_turn_ids: string[];
}

export interface ChatDetail extends Chat {
  messages: Message[];
  turns: TurnMeta[];
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

export interface QueueMessageResponse {
  message: Message;
}

export interface CommitPendingResponse {
  turn_id: string;
  turn_number: number;
  user_messages: Message[];
  assistant_messages: Message[];
}

export interface ContinueTurnResponse {
  turn_id: string;
  turn_number: number;
  parent_turn_id: string;
  assistant_message: Message;
}
