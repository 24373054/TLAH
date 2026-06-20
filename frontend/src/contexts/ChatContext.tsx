import { createContext, useCallback, useContext, useEffect, useReducer, useRef, type ReactNode } from 'react';
import type { ChatSummary, ChatDetail, Message, SendMessageResponse } from '../types';
import * as api from '../api/client';

// ── State ──────────────────────────────────────────────────────────

interface State {
  chats: ChatSummary[];
  currentChatId: string | null;
  currentChat: ChatDetail | null;
  loading: boolean;
  sending: boolean;
  polling: boolean;      // True while waiting for AI response
  error: string | null;
}

type Action =
  | { type: 'SET_CHATS'; chats: ChatSummary[] }
  | { type: 'SET_CURRENT_CHAT'; chat: ChatDetail | null }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_SENDING'; sending: boolean }
  | { type: 'SET_POLLING'; polling: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'ADD_MESSAGES'; userMsg: Message; assistantMsg: Message }
  | { type: 'ADD_QUEUED_MESSAGE'; message: Message }
  | { type: 'REFRESH_MESSAGES'; chat: ChatDetail }
  | { type: 'REMOVE_CHAT'; chatId: string }
  | { type: 'UPDATE_CHAT_TITLE'; chatId: string; title: string };

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
        polling: false,
        error: null,
      };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_SENDING':
      return { ...state, sending: action.sending };
    case 'SET_POLLING':
      return { ...state, polling: action.polling };
    case 'SET_ERROR':
      return { ...state, error: action.error, loading: false, sending: false, polling: false };
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
    case 'REFRESH_MESSAGES':
      if (!state.currentChat) return state;
      return {
        ...state,
        currentChat: {
          ...state.currentChat,
          messages: action.chat.messages,
          turns: action.chat.turns,
        },
      };
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
        chats: state.chats.map(c =>
          c.id === action.chatId ? { ...c, title: action.title } : c,
        ),
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
  /** Check for new AI replies from the async harness (called manually or by polling) */
  checkForReplies: () => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// ── Polling Configuration ──────────────────────────────────────────

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 90000;

// ── Provider ───────────────────────────────────────────────────────

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    chats: [],
    currentChatId: null,
    currentChat: null,
    loading: false,
    sending: false,
    polling: false,
    error: null,
  });

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  // ── Polling ────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    dispatch({ type: 'SET_POLLING', polling: false });
  }, []);

  const startPolling = useCallback(
    (chatId: string) => {
      stopPolling();
      pollStartRef.current = Date.now();
      dispatch({ type: 'SET_POLLING', polling: true });

      pollTimerRef.current = setInterval(async () => {
        // Timeout check
        if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
          stopPolling();
          dispatch({
            type: 'SET_ERROR',
            error: 'AI response timed out. The decision loop may be stuck.',
          });
          return;
        }

        try {
          const chat = await api.getChat(chatId);
          const prev = state.currentChat;
          if (!prev) {
            stopPolling();
            return;
          }

          // Check if there are new assistant messages, or pending messages got acknowledged
          const prevMsgIds = new Set(prev.messages.map(m => m.id));
          const newMsgs = chat.messages.filter(m => !prevMsgIds.has(m.id));
          const hasNewAssistant = newMsgs.some(m => m.role === 'assistant');
          const prevPendingCount = prev.messages.filter(m => m.turn_id === null).length;
          const currPendingCount = chat.messages.filter(m => m.turn_id === null).length;
          const pendingResolved = prevPendingCount > 0 && currPendingCount < prevPendingCount;

          if (hasNewAssistant || pendingResolved || newMsgs.length > 0) {
            dispatch({ type: 'REFRESH_MESSAGES', chat });
            if (!chat.messages.some(m => m.turn_id === null)) {
              // All messages confirmed — stop polling
              stopPolling();
            }
          }
        } catch {
          // Silently continue polling on transient errors
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling, state.currentChat],
  );

  const checkForReplies = useCallback(async () => {
    if (!state.currentChatId) return;
    try {
      const chat = await api.getChat(state.currentChatId);
      dispatch({ type: 'REFRESH_MESSAGES', chat });
      if (!chat.messages.some(m => m.turn_id === null)) {
        stopPolling();
      }
    } catch {
      // ignore
    }
  }, [state.currentChatId, stopPolling]);

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
    stopPolling();
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      const chat = await api.getChat(id);
      dispatch({ type: 'SET_CURRENT_CHAT', chat });
      // If there are pending messages (turn_id=null), start polling
      if (chat.messages.some(m => m.turn_id === null)) {
        startPolling(id);
      }
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: (e as Error).message });
    }
  }, [stopPolling, startPolling]);

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
      stopPolling();
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: (e as Error).message });
    }
  }, [stopPolling]);

  // ── Send Message (async harness: queue → poll) ──────────────────

  const sendMessage = useCallback(
    async (content: string, role?: string): Promise<SendMessageResponse | null> => {
      if (!state.currentChatId) return null;
      dispatch({ type: 'SET_SENDING', sending: true });
      dispatch({ type: 'SET_ERROR', error: null });

      try {
        // Use the async harness: queue the message, let DecisionLoop handle it
        const result = await api.queueMessage(state.currentChatId, content, role);
        // Show the queued message immediately in the chat
        dispatch({ type: 'ADD_QUEUED_MESSAGE', message: result.message });
        // Start polling for the AI response
        startPolling(state.currentChatId);
        await loadChats(); // Refresh sidebar
        return null; // No immediate assistant message — it'll arrive via polling
      } catch (e) {
        dispatch({ type: 'SET_ERROR', error: (e as Error).message });
        return null;
      } finally {
        dispatch({ type: 'SET_SENDING', sending: false });
      }
    },
    [state.currentChatId, startPolling, loadChats],
  );

  // ── Settings ────────────────────────────────────────────────────

  const updateSystemPrompt = useCallback(
    async (prompt: string) => {
      if (!state.currentChatId) return;
      try {
        await api.updateChat(state.currentChatId, { system_prompt: prompt });
        if (state.currentChat) {
          dispatch({
            type: 'SET_CURRENT_CHAT',
            chat: { ...state.currentChat, system_prompt: prompt },
          });
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
    return () => stopPolling();
  }, [loadChats, stopPolling]);

  return (
    <ChatContext.Provider
      value={{
        state,
        loadChats,
        selectChat,
        createChat,
        deleteChat,
        sendMessage,
        updateSystemPrompt,
        updateTitle,
        checkForReplies,
      }}
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
