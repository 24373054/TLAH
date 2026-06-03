import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export interface BgConfig {
  image: string | null;       // base64 data URL
  brightness: number;         // 0–200 (100 = normal)
  opacity: number;            // 0–100
  zoom: number;               // 100–300 (100 = contain, higher = zoom in)
  posX: number;               // 0–100 (horizontal position %)
  posY: number;               // 0–100 (vertical position %)
}

const DEFAULT: BgConfig = {
  image: null,
  brightness: 100,
  opacity: 30,
  zoom: 120,
  posX: 50,
  posY: 50,
};

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
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT };
}

export function BackgroundProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<BgConfig>(load);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(config)); } catch {}
  }, [config]);

  const updateConfig = useCallback((patch: Partial<BgConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
  }, []);

  const resetConfig = useCallback(() => {
    setConfig({ ...DEFAULT });
  }, []);

  return (
    <Context.Provider value={{ config, updateConfig, resetConfig }}>
      {children}
    </Context.Provider>
  );
}

export function useBackground(): BgContextValue {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useBackground must be used within BackgroundProvider');
  return ctx;
}
