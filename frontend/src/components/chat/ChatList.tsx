import { useChat } from '../../contexts/ChatContext';
import { ChatListItem } from './ChatListItem';

interface Props {
  onSelect?: () => void;
}

export function ChatList({ onSelect }: Props) {
  const { state, selectChat } = useChat();
  const { chats, currentChatId } = state;

  const handleSelect = (id: string) => {
    selectChat(id);
    onSelect?.();
  };

  if (chats.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-gray-400 dark:text-gray-500 text-sm">No chats yet</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
      {chats.map(chat => (
        <ChatListItem
          key={chat.id}
          id={chat.id}
          title={chat.title}
          messageCount={chat.message_count}
          isActive={chat.id === currentChatId}
          onClick={() => handleSelect(chat.id)}
        />
      ))}
    </div>
  );
}
