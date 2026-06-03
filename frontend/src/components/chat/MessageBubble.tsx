import { useDebugPanel } from '../../contexts/DebugPanelContext';
import type { Message } from '../../types';

export function MessageBubble({ message }: { message: Message }) {
  const { toggleDebug } = useDebugPanel();
  const isSystem = message.role === 'system';
  const isAssistant = message.role === 'assistant';
  const isUser = !isSystem && !isAssistant;
  const hasDebug = !!message.turn_id;

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="text-xs text-gray-500 dark:text-gray-400 italic px-3 py-1
                         bg-gray-200 dark:bg-gray-900 rounded-full max-w-[90%] text-center">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} group`}>
      <span className="text-[10px] px-1 mb-0.5 font-mono text-gray-400 dark:text-gray-600">
        {message.role}
      </span>

      <div
        className={`relative max-w-[88%] sm:max-w-[75%] rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 text-sm leading-relaxed
          ${isUser
            ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200 rounded-br-md'
            : 'bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-bl-md border border-gray-200 dark:border-gray-800'
          }`}
      >
        <div className="message-content whitespace-pre-wrap break-words">
          {message.content}
        </div>

        {hasDebug && isAssistant && (
          <button
            onClick={() => toggleDebug(message.turn_id!)}
            className="mt-1.5 flex items-center gap-1 px-2 py-1 rounded-md
                       bg-gray-200 dark:bg-gray-800 border border-gray-300 dark:border-gray-700
                       text-gray-500 dark:text-gray-400
                       hover:text-purple-600 dark:hover:text-purple-400
                       hover:border-purple-400 dark:hover:border-purple-600
                       md:absolute md:-right-8 md:top-1/2 md:-translate-y-1/2 md:mt-0
                       md:opacity-0 md:group-hover:opacity-100
                       transition-all duration-150 text-[10px]"
            title="Inspect raw API request & response"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className="md:hidden">Inspect</span>
          </button>
        )}

        {hasDebug && (
          <div className={`mt-1 flex items-center gap-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
            <span className="text-[10px] text-gray-400 dark:text-gray-600 font-mono">
              Turn #{message.turn_id?.slice(-6)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
