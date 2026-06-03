import { useState } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { Sidebar } from './Sidebar';
import { EmptyState } from './EmptyState';
import { ChatHeader } from '../chat/ChatHeader';
import { MessageList } from '../chat/MessageList';
import { MessageInput } from '../chat/MessageInput';

export function AppLayout({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { state } = useChat();
  const { currentChat } = state;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — slides in on mobile, static on desktop */}
      <div className={`
        fixed md:static inset-y-0 left-0 z-40
        transform transition-transform duration-200 ease-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
      `}>
        <Sidebar
          onOpenSettings={onOpenSettings}
          onSelectChat={() => setSidebarOpen(false)}
        />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!currentChat ? (
          <EmptyState />
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
