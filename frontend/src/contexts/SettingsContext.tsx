import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { GlobalSettings, ChatSettings, ProviderInfo } from '../types';
import * as api from '../api/client';

interface SettingsContextValue {
  globalSettings: GlobalSettings | null;
  providers: ProviderInfo[];
  loadSettings: () => Promise<void>;
  saveGlobalSettings: (data: Partial<GlobalSettings>) => Promise<void>;
  saveChatSettings: (chatId: string, data: Partial<ChatSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);

  const loadSettings = useCallback(async () => {
    try {
      const [gs, provs] = await Promise.all([
        api.getGlobalSettings(),
        api.listProviders(),
      ]);
      setGlobalSettings(gs);
      setProviders(provs);
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }, []);

  const saveGlobalSettings = useCallback(async (data: Partial<GlobalSettings>) => {
    try {
      const updated = await api.updateGlobalSettings(data);
      setGlobalSettings(updated);
    } catch (e) {
      console.error('Failed to save settings:', e);
      throw e;
    }
  }, []);

  const saveChatSettings = useCallback(async (chatId: string, data: Partial<ChatSettings>) => {
    try {
      await api.updateChatSettings(chatId, data);
    } catch (e) {
      console.error('Failed to save chat settings:', e);
      throw e;
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  return (
    <SettingsContext.Provider value={{ globalSettings, providers, loadSettings, saveGlobalSettings, saveChatSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
