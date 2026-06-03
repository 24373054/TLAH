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

  // Build background style: crop top/bottom → chat top/bottom, centered horizontally.
  // The image is scaled & positioned so the user's crop rect fills the chat area height,
  // with horizontal centering. Areas outside the image are transparent.
  const bgStyle: React.CSSProperties = config.image ? (() => {
    const { cropX, cropY, cropW, cropH } = config;
    const ch = Math.max(cropH, 0.01);
    const cw = Math.max(cropW, 0.01);
    const cropCX = cropX + cropW / 2; // crop center X

    // Scale so the crop height fills the element
    const sizeY = 100 / ch;

    // Position: crop top at element top (0%), crop horizontally centered (50%)
    // background-position percentage P aligns the P% point of image with P% point of element.
    // When image size ≠ element size, the formula for element-relative offset is:
    //   offset = (E - imageSize) * P / 100
    // We solve for P so that the crop rect aligns with the element.
    const posX = cw < 0.99
      ? ((cropCX - 0.5 * cw) / (1 - cw)) * 100
      : 50;
    const posY = ch < 0.99
      ? (cropY / (1 - ch)) * 100
      : 0;

    return {
      backgroundImage: `url(${config.image})`,
      backgroundSize: `auto ${sizeY}%`,
      backgroundPosition: `${posX}% ${posY}%`,
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
