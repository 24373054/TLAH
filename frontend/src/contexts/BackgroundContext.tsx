import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export interface BgConfig {
  image: string | null;       // base64 data URL
  brightness: number;         // 0–200 (100 = normal)
  opacity: number;            // 0–100
  cropX: number;              // left edge of crop in canvas space (may extend beyond [0,1])
  cropY: number;              // top edge of crop in canvas space
  cropW: number;              // width of crop in canvas space
  cropH: number;              // height of crop in canvas space
  imgX: number;               // left edge of image in canvas space (0–1)
  imgY: number;               // top edge of image in canvas space (0–1)
  imgW: number;               // width of image in canvas space (0–1)
  imgH: number;               // height of image in canvas space (0–1)
}

const DEFAULT: BgConfig = {
  image: null,
  brightness: 100,
  opacity: 30,
  cropX: 0, cropY: 0, cropW: 1, cropH: 1,
  imgX: 0, imgY: 0, imgW: 1, imgH: 1,
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
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate old zoom/posX/posY format
      if (parsed.zoom !== undefined && parsed.cropW === undefined) {
        const zoom = parsed.zoom || 100;
        const posX = parsed.posX ?? 50;
        const posY = parsed.posY ?? 50;
        const cw = Math.min(1, 100 / zoom);
        const ch = cw; // approximate
        return {
          ...DEFAULT,
          image: parsed.image ?? null,
          brightness: parsed.brightness ?? 100,
          opacity: parsed.opacity ?? 30,
          cropX: Math.max(0, (posX / 100) - cw / 2),
          cropY: Math.max(0, (posY / 100) - ch / 2),
          cropW: cw, cropH: ch,
          imgX: 0, imgY: 0, imgW: 1, imgH: 1,
        };
      }
      return { ...DEFAULT, ...parsed };
    }
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
