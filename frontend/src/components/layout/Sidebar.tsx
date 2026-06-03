import { useChat } from '../../contexts/ChatContext';
import { ChatList } from '../chat/ChatList';

interface Props {
  onOpenSettings: () => void;
  onSelectChat?: () => void; // close sidebar on mobile after selection
}

export function Sidebar({ onOpenSettings, onSelectChat }: Props) {
  const { createChat } = useChat();

  return (
    <div className="w-72 min-w-[260px] max-w-[85vw] bg-gray-900 border-r border-gray-800 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between shrink-0">
        <h1 className="text-lg font-semibold text-gray-100 tracking-tight">TLAH</h1>
        <span className="hidden sm:inline text-xs text-gray-500 font-mono">Talk Like A Human</span>
      </div>

      {/* New Chat Button */}
      <div className="p-3 shrink-0">
        <button
          onClick={createChat}
          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg
                     bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium
                     border border-gray-700 hover:border-gray-600
                     transition-colors duration-150"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Chat List */}
      <ChatList onSelect={onSelectChat} />

      {/* Footer — Settings */}
      <div className="p-3 border-t border-gray-800 shrink-0">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-4 py-2 rounded-lg
                     text-gray-400 hover:text-gray-200 hover:bg-gray-800 text-sm
                     transition-colors duration-150"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </div>
    </div>
  );
}
