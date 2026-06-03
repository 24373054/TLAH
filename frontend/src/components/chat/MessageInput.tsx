import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { useSettings } from '../../contexts/SettingsContext';
import { Spinner } from '../common/Spinner';

export function MessageInput() {
  const { state, sendMessage } = useChat();
  const { globalSettings } = useSettings();
  const { sending, currentChatId } = state;
  const [input, setInput] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const effectiveUserRole = globalSettings?.user_role ?? 'user';
  const activeRole = role ?? effectiveUserRole;
  const isSystem = activeRole === 'system';

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending || !currentChatId) return;
    setInput('');
    await sendMessage(trimmed, activeRole !== effectiveUserRole ? activeRole : undefined);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!currentChatId) return null;

  const roleOptions = [
    { label: effectiveUserRole, value: null },
    { label: 'system', value: 'system' },
  ];

  return (
    <div className="border-t border-gray-200 dark:border-gray-800 px-2 sm:px-4 py-2 sm:py-3 shrink-0">
      <div className="max-w-3xl mx-auto flex items-end gap-1.5 sm:gap-2">
        {/* Role selector */}
        <div className="flex gap-0.5 shrink-0">
          {roleOptions.map(opt => (
            <button
              key={opt.label}
              onClick={() => setRole(opt.value)}
              className={`px-1.5 sm:px-2 py-1 rounded text-[9px] sm:text-[10px] font-mono font-medium transition-colors
                ${activeRole === (opt.value ?? effectiveUserRole)
                  ? 'bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-gray-200'
                  : 'bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-600 hover:text-gray-700 dark:hover:text-gray-400'
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isSystem ? 'System message...' : 'Message...'}
          rows={1}
          disabled={sending}
          className={`flex-1 bg-white dark:bg-gray-800 border rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 text-sm
                     placeholder-gray-400 dark:placeholder-gray-500 resize-none disabled:opacity-50 transition-colors
                     focus:outline-none focus:ring-1
                     ${isSystem
                       ? 'border-yellow-300 dark:border-yellow-700/50 text-yellow-900 dark:text-yellow-100 focus:border-yellow-500 focus:ring-yellow-500/30'
                       : 'border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:border-purple-500 focus:ring-purple-500/30'
                     }
                     disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600`}
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className={`shrink-0 p-2.5 rounded-xl font-medium transition-colors duration-150
                     disabled:cursor-not-allowed
                     ${isSystem
                       ? 'bg-yellow-500 hover:bg-yellow-400 dark:bg-yellow-600 dark:hover:bg-yellow-500 text-white disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600'
                       : 'bg-purple-600 hover:bg-purple-500 text-white disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600'
                     }`}
        >
          {sending ? (
            <Spinner className="w-5 h-5" />
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>
      <p className="text-[10px] sm:text-[11px] text-gray-400 dark:text-gray-500 text-center mt-1.5 sm:mt-2 flex items-center justify-center gap-1.5 sm:gap-2">
        <span className={`font-mono ${activeRole === 'system' ? 'text-yellow-600 dark:text-yellow-500' : 'text-gray-500'}`}>
          [{activeRole}]
        </span>
        <span className="hidden sm:inline">
          <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-500 dark:text-gray-400 font-mono">Enter</kbd> to send
          · <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-500 dark:text-gray-400 font-mono">Shift+Enter</kbd> for newline
        </span>
      </p>
    </div>
  );
}
