import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface DebugPanelContextValue {
  isOpen: boolean;
  activeTurnId: string | null;
  openDebug: (turnId: string) => void;
  closeDebug: () => void;
  toggleDebug: (turnId: string) => void;
}

const DebugPanelContext = createContext<DebugPanelContextValue | null>(null);

export function DebugPanelProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);

  const openDebug = useCallback((turnId: string) => {
    setActiveTurnId(turnId);
    setIsOpen(true);
  }, []);

  const closeDebug = useCallback(() => {
    setIsOpen(false);
    // Keep turnId briefly for exit animation, then clear
    setTimeout(() => setActiveTurnId(null), 300);
  }, []);

  const toggleDebug = useCallback((turnId: string) => {
    if (activeTurnId === turnId && isOpen) {
      closeDebug();
    } else {
      openDebug(turnId);
    }
  }, [activeTurnId, isOpen, openDebug, closeDebug]);

  return (
    <DebugPanelContext.Provider value={{ isOpen, activeTurnId, openDebug, closeDebug, toggleDebug }}>
      {children}
    </DebugPanelContext.Provider>
  );
}

export function useDebugPanel(): DebugPanelContextValue {
  const ctx = useContext(DebugPanelContext);
  if (!ctx) throw new Error('useDebugPanel must be used within DebugPanelProvider');
  return ctx;
}
