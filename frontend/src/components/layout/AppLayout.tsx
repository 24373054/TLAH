import { useState, useEffect, useRef } from 'react';
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

const CANVAS_AR = 4 / 3;

export function AppLayout({ onOpenSettings, onOpenBackground }: Props) {
  const { state } = useChat();
  const { currentChat } = state;
  const { config } = useBackground();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  // Track CHAT AREA size (sidebar excluded) for background positioning
  useEffect(() => {
    const el = chatRef.current;
    if (!el || !config.image) return;
    const ro = new ResizeObserver(([e]) => {
      setDims({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [config.image]);

  // Pixel-precise: crop rect height → chat area height, centered horizontally.
  const bgData = (() => {
    if (!config.image || !dims.w || !dims.h) return null;
    const { cropX, cropY, cropW, cropH, imgX, imgY, imgW, imgH } = config;
    const ch = Math.max(cropH, 0.01);

    const canvasW = dims.w;
    const canvasH = canvasW / CANVAS_AR;
    const scale = dims.h / (ch * canvasH);

    const cropWidth = cropW * canvasW * scale;
    const cropHeight = cropH * canvasH * scale;
    const centerOff = (dims.w - cropWidth) / 2;

    // Crop window centered horizontally, aligned top.
    // Image positioned so crop movement and image movement match direction.
    const imgLeft = centerOff + (cropX - imgX) * canvasW * scale;
    const imgTop = (cropY - imgY) * canvasH * scale;

    return {
      cropStyle: {
        position: 'absolute' as const,
        left: `${centerOff}px`,
        top: 0,
        width: `${cropWidth}px`,
        height: `${cropHeight}px`,
        overflow: 'hidden',
      },
      imgStyle: {
        position: 'absolute' as const,
        left: `${imgLeft}px`,
        top: `${imgTop}px`,
        width: `${imgW * canvasW * scale}px`,
        height: `${imgH * canvasH * scale}px`,
        filter: `brightness(${config.brightness}%)`,
        opacity: config.opacity / 100,
      },
    };
  })();

  return (
    <div className="flex h-full overflow-hidden relative">
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

      {/* Main Chat Area — this is where the background lives */}
      <div ref={chatRef} className="flex-1 flex flex-col min-w-0 relative">
        {/* Background — inside chat area, covers exactly the message region */}
        {bgData && (
          <div className="absolute inset-0 z-0 pointer-events-none">
            <div style={bgData.cropStyle}>
              <img src={config.image!} alt="" style={bgData.imgStyle} />
            </div>
          </div>
        )}

        {/* Chat UI (above background, z-10) */}
        <div className="relative z-10 flex flex-col flex-1 min-h-0">
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
    </div>
  );
}
