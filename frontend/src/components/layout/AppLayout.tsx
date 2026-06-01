import { useChat } from '../../contexts/ChatContext';
import { Sidebar } from './Sidebar';
import { EmptyState } from './EmptyState';
import { ChatHeader } from '../chat/ChatHeader';
import { MessageList } from '../chat/MessageList';
import { MessageInput } from '../chat/MessageInput';

export function AppLayout({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { state } = useChat();
  const { currentChat } = state;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Sidebar */}
      <Sidebar onOpenSettings={onOpenSettings} />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!currentChat ? (
          <EmptyState />
        ) : (
          <>
            <ChatHeader />
            <MessageList />
            <MessageInput />
          </>
        )}
      </div>
    </div>
  );
}
