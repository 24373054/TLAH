import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export interface BgConfig {
  image: string | null;
  brightness: number;  // 0–200, 100 = normal
  opacity: number;     // 0–100
}

const DEFAULT: BgConfig = { image: null, brightness: 100, opacity: 30 };

interface BgContextValue {
  config: BgConfig;
  updateConfig: (patch: Partial<BgConfig>) => void;
  resetConfig: () => void;
}

const Context = createContext<BgContextValue | null>(null);
const KEY = 'tlah-bg';

function load(): BgConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { image: p.image ?? null, brightness: p.brightness ?? 100, opacity: p.opacity ?? 30 };
    }
  } catch {}
  return { ...DEFAULT };
}

export function BackgroundProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<BgConfig>(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(config)); } catch {} }, [config]);
  const updateConfig = useCallback((p: Partial<BgConfig>) => setConfig(prev => ({ ...prev, ...p })), []);
  const resetConfig = useCallback(() => setConfig({ ...DEFAULT }), []);
  return <Context.Provider value={{ config, updateConfig, resetConfig }}>{children}</Context.Provider>;
}

export function useBackground(): BgContextValue {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useBackground must be used within BackgroundProvider');
  return ctx;
}
