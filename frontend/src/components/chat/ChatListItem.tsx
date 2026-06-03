import { useState } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface Props {
  id: string;
  title: string;
  messageCount: number;
  isActive: boolean;
  onClick: () => void;
}

export function ChatListItem({ id, title, messageCount, isActive, onClick }: Props) {
  const { deleteChat } = useChat();
  const [showDelete, setShowDelete] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    setConfirmOpen(false);
    await deleteChat(id);
  };

  return (
    <>
      <div
        onClick={onClick}
        onMouseEnter={() => setShowDelete(true)}
        onMouseLeave={() => setShowDelete(false)}
        onTouchStart={() => setShowDelete(s => !s)}
        className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-sm
          transition-colors duration-100
          ${isActive
            ? 'bg-gray-800 text-gray-100 border border-gray-700'
            : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 border border-transparent'
          }`}
      >
        {/* Chat icon */}
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>

        {/* Title + count */}
        <span className="truncate flex-1">{title}</span>
        {messageCount > 0 && (
          <span className="text-xs text-gray-600 group-hover:text-gray-500">{messageCount}</span>
        )}

        {/* Delete button — hover reveals on desktop; always visible on mobile */}
        <button
          onClick={handleDeleteClick}
          className={`shrink-0 p-1 rounded hover:bg-red-900/50 text-gray-600 hover:text-red-400
                     transition-all duration-100
                     md:opacity-0 md:group-hover:opacity-100
                     ${showDelete ? 'opacity-100' : ''}`}
          title="Delete chat"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Chat"
        message={`Delete "${title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
