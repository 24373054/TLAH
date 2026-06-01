import { useEffect, useRef } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { MessageBubble } from './MessageBubble';
import { Spinner } from '../common/Spinner';

export function MessageList() {
  const { state } = useChat();
  const { currentChat, sending } = state;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChat?.messages, sending]);

  if (!currentChat) return null;

  const messages = currentChat.messages || [];

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
      {messages.length === 0 && !sending && (
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-600 text-sm">Send a message to start debugging prompts</p>
        </div>
      )}

      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {/* Loading indicator */}
      {sending && (
        <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
          <div className="w-7 h-7 rounded-full bg-purple-600/20 flex items-center justify-center">
            <Spinner className="text-purple-400 w-4 h-4" />
          </div>
          <span className="text-sm text-gray-500">Thinking...</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
