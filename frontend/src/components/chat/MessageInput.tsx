import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { Spinner } from '../common/Spinner';

export function MessageInput() {
  const { state, sendMessage } = useChat();
  const { sending, currentChatId } = state;
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
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
    await sendMessage(trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!currentChatId) return null;

  return (
    <div className="border-t border-gray-800 px-4 py-3 shrink-0">
      <div className="max-w-3xl mx-auto flex items-end gap-3">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
          rows={1}
          disabled={sending}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5
                     text-sm text-gray-100 placeholder-gray-500
                     focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30
                     resize-none disabled:opacity-50 transition-colors"
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="shrink-0 p-2.5 rounded-xl bg-purple-600 hover:bg-purple-500
                     disabled:bg-gray-800 disabled:text-gray-600 text-white
                     transition-colors duration-150 disabled:cursor-not-allowed"
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
      <p className="text-[11px] text-gray-600 text-center mt-2">
        Press <kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-400 font-mono">Enter</kbd> to send
        · <kbd className="px-1 py-0.5 bg-gray-800 rounded text-gray-400 font-mono">Shift+Enter</kbd> for newline
      </p>
    </div>
  );
}
