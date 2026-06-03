import { useState } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { useBackground } from '../../contexts/BackgroundContext';
import { Sidebar } from './Sidebar';
import { EmptyState } from './EmptyState';
import { ChatHeader } from '../chat/ChatHeader';
import { MessageList } from '../chat/MessageList';
import { MessageInput } from '../chat/MessageInput';

interface Props {
  onOpenSettings: () => void;
  onOpenBackground: () => void;
}

export function AppLayout({ onOpenSettings, onOpenBackground }: Props) {
  const { state } = useChat();
  const { currentChat } = state;
  const { config } = useBackground();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Build background style from crop rect + image position in canvas space
  // The crop rect defines what fills the screen; image is positioned within it.
  // Areas outside the image show the regular background color (effectively transparent).
  const bgStyle: React.CSSProperties = config.image ? (() => {
    const { cropX, cropY, cropW, cropH, imgX, imgY, imgW } = config;
    // Compute image position relative to crop rect
    const relX = ((imgX - cropX) / cropW) * 100;
    const relY = ((imgY - cropY) / cropH) * 100;
    return {
      backgroundImage: `url(${config.image})`,
      backgroundSize: `${(imgW / cropW) * 100}% auto`,
      backgroundPosition: `${relX}% ${relY}%`,
      backgroundRepeat: 'no-repeat',
      filter: `brightness(${config.brightness}%)`,
      opacity: config.opacity / 100,
    };
  })() : {};

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* Background layer — sits behind everything */}
      {config.image && (
        <div className="absolute inset-0 z-0 pointer-events-none" style={bgStyle} />
      )}

      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed md:static inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <Sidebar
          onOpenSettings={onOpenSettings}
          onOpenBackground={onOpenBackground}
          onSelectChat={() => setSidebarOpen(false)}
        />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {!currentChat ? (
          <EmptyState onMenuClick={() => setSidebarOpen(true)} />
        ) : (
          <>
            <ChatHeader onMenuClick={() => setSidebarOpen(true)} />
            <MessageList />
            <MessageInput />
          </>
        )}
      </div>
    </div>
  );
}
