import { useChat } from '../../contexts/ChatContext';

export function EmptyState() {
  const { createChat } = useChat();

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md px-8">
        <div className="text-6xl mb-6">🔍</div>
        <h2 className="text-2xl font-semibold text-gray-200 mb-3">Prompt Debugging Framework</h2>
        <p className="text-gray-400 mb-2 leading-relaxed">
          Every message turn captures the <span className="text-purple-400 font-medium">complete raw request</span> sent
          to the LLM API and the <span className="text-purple-400 font-medium">complete raw response</span>.
        </p>
        <p className="text-gray-500 text-sm mb-8 leading-relaxed">
          Click any assistant message to inspect exactly what was sent and received — including system prompts,
          full message history, and all API parameters.
        </p>
        <button
          onClick={createChat}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg
                     font-medium transition-colors duration-150 shadow-lg shadow-purple-600/25"
        >
          Start a New Chat
        </button>
      </div>
    </div>
  );
}
