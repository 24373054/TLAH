import { createContext, useCallback, useContext, useEffect, useReducer, useRef, type ReactNode } from 'react';

// ── Token buffer for smooth streaming ──────────────────────────────
const TOKEN_SPEED_MS = 22; // release one token every 22ms

let _tokenBuffer: string[] = [];
let _flushTimer: ReturnType<typeof setInterval> | null = null;

function startTokenFlush(dispatch: React.Dispatch<Action>) {
  if (_flushTimer) return;
  _flushTimer = setInterval(() => {
    if (_tokenBuffer.length === 0) return;
    // Release up to 2 tokens per tick to catch up if buffer grows
    const batch = _tokenBuffer.splice(0, 2);
    for (const t of batch) {
      dispatch({ type: 'APPEND_TOKEN', token: t });
    }
  }, TOKEN_SPEED_MS);
}

function stopTokenFlush() {
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
  // Drain remaining tokens immediately
  if (_tokenBuffer.length > 0) {
    _tokenBuffer = []; // Will be flushed on next render cycle
  }
  _tokenBuffer = [];
}
import type { ChatSummary, ChatDetail, Message, SendMessageResponse } from '../types';
import * as api from '../api/client';

// ── State ──────────────────────────────────────────────────────────

interface State {
  chats: ChatSummary[];
  currentChatId: string | null;
  currentChat: ChatDetail | null;
  loading: boolean;
  sending: boolean;
  streaming: boolean;          // True while receiving LLM tokens
  streamingContent: string;    // Accumulated streaming text (thinking)
  thinkingText: string | null; // Last completed thinking text (folded)
  error: string | null;
}

type Action =
  | { type: 'SET_CHATS'; chats: ChatSummary[] }
  | { type: 'SET_CURRENT_CHAT'; chat: ChatDetail | null }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_SENDING'; sending: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'ADD_MESSAGES'; userMsg: Message; assistantMsg: Message }
  | { type: 'ADD_QUEUED_MESSAGE'; message: Message; tempId?: string }
  | { type: 'ADD_SANDBOX_CALL'; content: string; description: string }
  | { type: 'ADD_SANDBOX_RESULT'; exit_code: number; output: string }
  | { type: 'START_STREAMING' }
  | { type: 'APPEND_TOKEN'; token: string }
  | { type: 'FINALIZE_STREAMING'; message?: Message }
  | { type: 'REFRESH_MESSAGES'; chat: ChatDetail }
  | { type: 'REMOVE_CHAT'; chatId: string }
  | { type: 'UPDATE_CHAT_TITLE'; chatId: string; title: string };

// Generate temp IDs for streaming placeholders
let _tempId = 0;
const _tid = () => `streaming-${++_tempId}`;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_CHATS':
      return { ...state, chats: action.chats };
    case 'SET_CURRENT_CHAT':
      return {
        ...state,
        currentChat: action.chat,
        currentChatId: action.chat?.id ?? null,
        loading: false,
        streaming: false,
        streamingContent: '',
        thinkingText: null,
        error: null,
      };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_SENDING':
      return { ...state, sending: action.sending };
    case 'SET_ERROR':
      return { ...state, error: action.error, loading: false, sending: false, streaming: false };
    case 'ADD_MESSAGES':
      if (!state.currentChat) return state;
      return {
        ...state,
        currentChat: {
          ...state.currentChat,
          messages: [...state.currentChat.messages, action.userMsg, action.assistantMsg],
        },
      };
    case 'ADD_QUEUED_MESSAGE':
      if (!state.currentChat) return state;
      return {
        ...state,
        currentChat: {
          ...state.currentChat,
          messages: [...state.currentChat.messages, action.message],
        },
      };
    case 'ADD_SANDBOX_CALL': {
      if (!state.currentChat) return state;
      const callMsg: Message = {
        id: _tid(),
        role: 'sandbox',
        content: action.content,
        turn_id: null,
        sequence_num: state.currentChat.messages.length + 1,
        message_type: 'sandbox_call',
        metadata_json: { command: action.content, description: action.description },
        created_at: new Date().toISOString(),
      };
      return {
        ...state,
        currentChat: { ...state.currentChat, messages: [...state.currentChat.messages, callMsg] },
      };
    }
    case 'ADD_SANDBOX_RESULT': {
      if (!state.currentChat) return state;
      const resultMsg: Message = {
        id: _tid(),
        role: 'sandbox',
        content: action.output,
        turn_id: null,
        sequence_num: state.currentChat.messages.length + 1,
        message_type: 'sandbox_result',
        metadata_json: { exit_code: action.exit_code, output: action.output },
        created_at: new Date().toISOString(),
      };
      return {
        ...state,
        currentChat: { ...state.currentChat, messages: [...state.currentChat.messages, resultMsg] },
      };
    }
    case 'START_STREAMING':
      return { ...state, streaming: true, streamingContent: '', thinkingText: null };
    case 'APPEND_TOKEN':
      return { ...state, streamingContent: state.streamingContent + action.token };
    case 'FINALIZE_STREAMING':
      return {
        ...state,
        streaming: false,
        thinkingText: state.streamingContent || null,
        streamingContent: '',
      };
    case 'REFRESH_MESSAGES':
      if (!state.currentChat) return state;
      return { ...state, currentChat: { ...state.currentChat, messages: action.chat.messages, turns: action.chat.turns } };
    case 'REMOVE_CHAT':
      return {
        ...state,
        chats: state.chats.filter(c => c.id !== action.chatId),
        currentChatId: state.currentChatId === action.chatId ? null : state.currentChatId,
        currentChat: state.currentChatId === action.chatId ? null : state.currentChat,
      };
    case 'UPDATE_CHAT_TITLE':
      return {
        ...state,
        chats: state.chats.map(c => c.id === action.chatId ? { ...c, title: action.title } : c),
      };
    default:
      return state;
  }
}

// ── Context Value ──────────────────────────────────────────────────

interface ChatContextValue {
  state: State;
  loadChats: () => Promise<void>;
  selectChat: (id: string) => Promise<void>;
  createChat: () => Promise<ChatDetail | null>;
  deleteChat: (id: string) => Promise<void>;
  sendMessage: (content: string, role?: string) => Promise<SendMessageResponse | null>;
  updateSystemPrompt: (prompt: string) => Promise<void>;
  updateTitle: (title: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    chats: [],
    currentChatId: null,
    currentChat: null,
    loading: false,
    sending: false,
    streaming: false,
    streamingContent: '',
    thinkingText: null,
    error: null,
  });

  const esRef = useRef<EventSource | null>(null);

  // ── SSE connection ──────────────────────────────────────────────

  const connectSSE = useCallback((chatId: string) => {
    // Close existing connection
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource(`/api/chats/${chatId}/stream`);
    esRef.current = es;

    es.addEventListener('thinking', () => {
      _tokenBuffer = [];
      dispatch({ type: 'START_STREAMING' });
      startTokenFlush(dispatch);
    });

    es.addEventListener('token', (e: MessageEvent) => {
      try {
        const { text } = JSON.parse(e.data);
        _tokenBuffer.push(text);
        startTokenFlush(dispatch);
      } catch { /* ignore parse errors */ }
    });

    es.addEventListener('sandbox_call', (e: MessageEvent) => {
      try {
        const { command, description } = JSON.parse(e.data);
        dispatch({ type: 'ADD_SANDBOX_CALL', content: command, description: description || '' });
      } catch { /* ignore */ }
    });

    es.addEventListener('sandbox_result', (e: MessageEvent) => {
      try {
        const { exit_code, output } = JSON.parse(e.data);
        dispatch({ type: 'ADD_SANDBOX_RESULT', exit_code: exit_code ?? 1, output: output || '' });
        dispatch({ type: 'FINALIZE_STREAMING' });
      } catch { /* ignore */ }
    });

    es.addEventListener('done', () => {
      stopTokenFlush();
      // Drain any remaining buffered tokens immediately
      if (_tokenBuffer.length > 0) {
        for (const t of _tokenBuffer) {
          dispatch({ type: 'APPEND_TOKEN', token: t });
        }
        _tokenBuffer = [];
      }
      dispatch({ type: 'FINALIZE_STREAMING' });
      // Reload chat to get the saved assistant messages
      api.getChat(chatId).then(chat => {
        dispatch({ type: 'REFRESH_MESSAGES', chat });
      }).catch(() => {});
    });

    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do
    };
  }, []);

  const disconnectSSE = useCallback(() => {
    stopTokenFlush();
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    dispatch({ type: 'FINALIZE_STREAMING' });
  }, []);

  // ── Chat operations ─────────────────────────────────────────────

  const loadChats = useCallback(async () => {
    try {
      const chats = await api.listChats();
      dispatch({ type: 'SET_CHATS', chats });
    } catch (e) {
      console.error('Failed to load chats:', e);
    }
  }, []);

  const selectChat = useCallback(async (id: string) => {
    disconnectSSE();
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      const chat = await api.getChat(id);
      dispatch({ type: 'SET_CURRENT_CHAT', chat });
      // Open SSE for this chat
      connectSSE(id);
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: (e as Error).message });
    }
  }, [disconnectSSE, connectSSE]);

  const createChat = useCallback(async () => {
    try {
      const chat = await api.createChat();
      await loadChats();
      await selectChat(chat.id);
      return await api.getChat(chat.id);
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: (e as Error).message });
      return null;
    }
  }, [loadChats, selectChat]);

  const deleteChat = useCallback(async (id: string) => {
    try {
      await api.deleteChat(id);
      dispatch({ type: 'REMOVE_CHAT', chatId: id });
      disconnectSSE();
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: (e as Error).message });
    }
  }, [disconnectSSE]);

  // ── Send Message ────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (content: string, role?: string): Promise<SendMessageResponse | null> => {
      if (!state.currentChatId) return null;
      dispatch({ type: 'SET_SENDING', sending: true });
      dispatch({ type: 'SET_ERROR', error: null });

      try {
        const result = await api.queueMessage(state.currentChatId, content, role);
        dispatch({ type: 'ADD_QUEUED_MESSAGE', message: result.message });
        await loadChats();
        // SSE will handle incoming tokens and messages — no polling needed
        return null;
      } catch (e) {
        dispatch({ type: 'SET_ERROR', error: (e as Error).message });
        return null;
      } finally {
        dispatch({ type: 'SET_SENDING', sending: false });
      }
    },
    [state.currentChatId, loadChats],
  );

  // ── Settings ────────────────────────────────────────────────────

  const updateSystemPrompt = useCallback(
    async (prompt: string) => {
      if (!state.currentChatId) return;
      try {
        await api.updateChat(state.currentChatId, { system_prompt: prompt });
        if (state.currentChat) {
          dispatch({ type: 'SET_CURRENT_CHAT', chat: { ...state.currentChat, system_prompt: prompt } });
        }
      } catch (e) {
        dispatch({ type: 'SET_ERROR', error: (e as Error).message });
      }
    },
    [state.currentChatId, state.currentChat],
  );

  const updateTitle = useCallback(
    async (title: string) => {
      if (!state.currentChatId) return;
      try {
        await api.updateChat(state.currentChatId, { title });
        dispatch({ type: 'UPDATE_CHAT_TITLE', chatId: state.currentChatId, title });
      } catch (e) {
        dispatch({ type: 'SET_ERROR', error: (e as Error).message });
      }
    },
    [state.currentChatId],
  );

  // ── Cleanup ────────────────────────────────────────────────────

  useEffect(() => {
    loadChats();
    return () => disconnectSSE();
  }, [loadChats, disconnectSSE]);

  return (
    <ChatContext.Provider
      value={{ state, loadChats, selectChat, createChat, deleteChat, sendMessage, updateSystemPrompt, updateTitle }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
