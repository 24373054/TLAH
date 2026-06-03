import { createContext, useCallback, useContext, useEffect, useReducer, type ReactNode } from 'react';
import type { ChatSummary, ChatDetail, Message, SendMessageResponse } from '../types';
import * as api from '../api/client';

interface State {
  chats: ChatSummary[];
  currentChatId: string | null;
  currentChat: ChatDetail | null;
  loading: boolean;
  sending: boolean;
  error: string | null;
}

type Action =
  | { type: 'SET_CHATS'; chats: ChatSummary[] }
  | { type: 'SET_CURRENT_CHAT'; chat: ChatDetail | null }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_SENDING'; sending: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'ADD_MESSAGES'; userMsg: Message; assistantMsg: Message }
  | { type: 'REMOVE_CHAT'; chatId: string }
  | { type: 'UPDATE_CHAT_TITLE'; chatId: string; title: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_CHATS':
      return { ...state, chats: action.chats };
    case 'SET_CURRENT_CHAT':
      return { ...state, currentChat: action.chat, currentChatId: action.chat?.id ?? null, loading: false, error: null };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'SET_SENDING':
      return { ...state, sending: action.sending };
    case 'SET_ERROR':
      return { ...state, error: action.error, loading: false, sending: false };
    case 'ADD_MESSAGES':
      if (!state.currentChat) return state;
      return {
        ...state,
        currentChat: {
          ...state.currentChat,
          messages: [...state.currentChat.messages, action.userMsg, action.assistantMsg],
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
        chats: state.chats.map(c => c.id === action.chatId ? { ...c, title: action.title } : c),
      };
    default:
      return state;
  }
}

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

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    chats: [],
    currentChatId: null,
    currentChat: null,
    loading: false,
    sending: false,
    error: null,
  });

  const loadChats = useCallback(async () => {
    try {
      const chats = await api.listChats();
      dispatch({ type: 'SET_CHATS', chats });
    } catch (e) {
      console.error('Failed to load chats:', e);
    }
  }, []);

  const selectChat = useCallback(async (id: string) => {
    dispatch({ type: 'SET_LOADING', loading: true });
    try {
      const chat = await api.getChat(id);
      dispatch({ type: 'SET_CURRENT_CHAT', chat });
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: (e as Error).message });
    }
  }, []);

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
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: (e as Error).message });
    }
  }, []);

  const sendMessage = useCallback(async (content: string, role?: string): Promise<SendMessageResponse | null> => {
    if (!state.currentChatId) return null;
    dispatch({ type: 'SET_SENDING', sending: true });
    dispatch({ type: 'SET_ERROR', error: null });
    try {
      const result = await api.sendMessage(state.currentChatId, content, role);
      dispatch({ type: 'ADD_MESSAGES', userMsg: result.user_message, assistantMsg: result.assistant_message });
      await loadChats(); // Refresh sidebar (updated_at, message count)
      return result;
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: (e as Error).message });
      return null;
    } finally {
      dispatch({ type: 'SET_SENDING', sending: false });
    }
  }, [state.currentChatId, loadChats]);

  const updateSystemPrompt = useCallback(async (prompt: string) => {
    if (!state.currentChatId) return;
    try {
      await api.updateChat(state.currentChatId, { system_prompt: prompt });
      if (state.currentChat) {
        dispatch({ type: 'SET_CURRENT_CHAT', chat: { ...state.currentChat, system_prompt: prompt } });
      }
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: (e as Error).message });
    }
  }, [state.currentChatId, state.currentChat]);

  const updateTitle = useCallback(async (title: string) => {
    if (!state.currentChatId) return;
    try {
      await api.updateChat(state.currentChatId, { title });
      dispatch({ type: 'UPDATE_CHAT_TITLE', chatId: state.currentChatId, title });
    } catch (e) {
      dispatch({ type: 'SET_ERROR', error: (e as Error).message });
    }
  }, [state.currentChatId]);

  // Load chats on mount
  useEffect(() => { loadChats(); }, [loadChats]);

  return (
    <ChatContext.Provider value={{ state, loadChats, selectChat, createChat, deleteChat, sendMessage, updateSystemPrompt, updateTitle }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
