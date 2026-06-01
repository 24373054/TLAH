import { useChat } from '../../contexts/ChatContext';
import { ChatListItem } from './ChatListItem';

export function ChatList() {
  const { state, selectChat } = useChat();
  const { chats, currentChatId } = state;

  if (chats.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-gray-600 text-sm">No chats yet</p>
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
          onClick={() => selectChat(chat.id)}
        />
      ))}
    </div>
  );
}
