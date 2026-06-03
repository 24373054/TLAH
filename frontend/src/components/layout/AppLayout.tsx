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

const CANVAS_AR = 4 / 3; // matches cropper canvas aspect ratio

export function AppLayout({ onOpenSettings, onOpenBackground }: Props) {
  const { state } = useChat();
  const { currentChat } = state;
  const { config } = useBackground();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [bgDims, setBgDims] = useState({ w: 0, h: 0 });

  // Track container size for pixel-precise background positioning
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !config.image) return;
    const ro = new ResizeObserver(([e]) => {
      setBgDims({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    setBgDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [config.image]);

  // Compute pixel-precise position so the crop rect fills container height
  // and is centered horizontally. A crop window clips the image.
  const bgData = (() => {
    if (!config.image || !bgDims.w || !bgDims.h) return null;
    const { cropX, cropY, cropW, cropH, imgX, imgY, imgW, imgH } = config;
    const ch = Math.max(cropH, 0.01);

    const canvasW = bgDims.w;
    const canvasH = canvasW / CANVAS_AR;
    const scale = bgDims.h / (ch * canvasH);

    // Crop rect in container pixels
    const cropLeft = cropX * canvasW * scale;
    const cropTop = cropY * canvasH * scale;
    const cropWidth = cropW * canvasW * scale;
    const cropHeight = cropH * canvasH * scale;

    // Center horizontally
    const centerOff = (bgDims.w - cropWidth) / 2;
    const cropWinLeft = centerOff;
    const cropWinTop = 0; // crop fills container height, so top is 0

    // Image relative to crop window
    const imgLeft = imgX * canvasW * scale - cropLeft + centerOff;
    const imgTop = imgY * canvasH * scale - cropTop;

    return {
      cropStyle: {
        position: 'absolute' as const,
        left: `${cropWinLeft}px`,
        top: `${cropWinTop}px`,
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
    <div ref={containerRef} className="flex h-full overflow-hidden relative">
      {/* Background layer — crop window clips image */}
      {bgData && (
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div style={bgData.cropStyle}>
            <img src={config.image!} alt="" style={bgData.imgStyle} />
          </div>
        </div>
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
