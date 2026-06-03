import { useChat } from '../../contexts/ChatContext';

interface Props {
  onMenuClick?: () => void;
  hasChats?: boolean;
}

export function EmptyState({ onMenuClick, hasChats }: Props) {
  const { createChat } = useChat();

  return (
    <div className="flex-1 flex flex-col">
      {/* Mobile top bar with hamburger — only when there are existing chats to show */}
      {hasChats && (
        <div className="md:hidden border-b border-gray-800 px-2 py-2 flex items-center shrink-0">
          <button
            onClick={onMenuClick}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="ml-2 text-sm text-gray-500">Select a chat</span>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-4xl sm:text-6xl mb-4 sm:mb-6">🔍</div>
          <h2 className="text-lg sm:text-2xl font-semibold text-gray-200 mb-2 sm:mb-3">Prompt Debugging Framework</h2>
          <p className="text-gray-400 text-sm sm:text-base mb-2 leading-relaxed">
            Every message turn captures the <span className="text-purple-400 font-medium">complete raw request</span> sent
            to the LLM API and the <span className="text-purple-400 font-medium">complete raw response</span>.
          </p>
          <p className="text-gray-500 text-xs sm:text-sm mb-6 sm:mb-8 leading-relaxed">
            Click any assistant message to inspect exactly what was sent and received — including system prompts,
            full message history, and all API parameters.
          </p>
          <button
            onClick={createChat}
            className="px-5 sm:px-6 py-2.5 sm:py-3 bg-purple-600 hover:bg-purple-500 text-white text-sm sm:text-base rounded-lg
                       font-medium transition-colors duration-150 shadow-lg shadow-purple-600/25"
          >
            Start a New Chat
          </button>
          {hasChats && (
            <button
              onClick={onMenuClick}
              className="mt-3 block mx-auto text-sm text-gray-500 hover:text-gray-300 transition-colors md:hidden"
            >
              Or open chat history →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
