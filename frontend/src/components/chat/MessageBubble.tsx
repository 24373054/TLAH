import { useDebugPanel } from '../../contexts/DebugPanelContext';
import type { Message } from '../../types';

export function MessageBubble({ message }: { message: Message }) {
  const { toggleDebug } = useDebugPanel();
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const hasDebug = !!message.turn_id; // Only assistant+user messages in a turn have debug data

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="text-xs text-gray-600 italic px-3 py-1 bg-gray-900 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
      <div
        className={`relative max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
          ${isUser
            ? 'bg-gray-800 text-gray-200 rounded-br-md'
            : 'bg-gray-900 text-gray-200 rounded-bl-md border border-gray-800'
          }`}
      >
        {/* Message content */}
        <div className="message-content whitespace-pre-wrap break-words">
          {message.content}
        </div>

        {/* Debug inspect button — shown on hover for messages with turn data */}
        {hasDebug && !isUser && (
          <button
            onClick={() => toggleDebug(message.turn_id!)}
            className="absolute -right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100
                       p-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400
                       hover:text-purple-400 hover:border-purple-600 transition-all duration-150
                       shadow-lg"
            title="Inspect raw API request & response"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
        )}

        {/* Turn number badge */}
        {hasDebug && (
          <div className={`mt-1 flex items-center gap-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
            <span className="text-[10px] text-gray-600 font-mono">
              Turn #{message.turn_id?.slice(-6)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
