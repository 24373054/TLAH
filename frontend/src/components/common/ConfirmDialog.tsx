interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  danger = true,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
         onClick={onCancel}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm mx-4 shadow-2xl"
           onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
        </div>
        <div className="p-4">
          <p className="text-sm text-gray-400">{message}</p>
        </div>
        <div className="p-3 border-t border-gray-800 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg
                       hover:bg-gray-800 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors
              ${danger
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-purple-600 hover:bg-purple-500 text-white'
              }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
