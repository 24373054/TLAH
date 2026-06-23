import { useDebugPanel } from '../../contexts/DebugPanelContext';
import { useBackground } from '../../contexts/BackgroundContext';
import type { Message } from '../../types';

interface Props {
  message: Message;
  isPending?: boolean;
  hasContinuations?: boolean;
}

export function MessageBubble({ message, isPending, hasContinuations }: Props) {
  const { toggleDebug } = useDebugPanel();
  const { config: bg } = useBackground();
  const isSystem = message.role === 'system';
  const isAssistant = message.role === 'assistant';
  const isUser = !isSystem && !isAssistant && message.role !== 'sandbox';
  const hasDebug = !!message.turn_id;
  const alpha = bg.chatOpacity / 100;
  const isSandboxCall = message.message_type === 'sandbox_call';
  const isSandboxResult = message.message_type === 'sandbox_result';

  if (isSandboxCall) {
    const meta = message.metadata_json || {};
    const cmd = (meta.command as string) || message.content;
    return (
      <div className="flex justify-center py-1">
        <div className="relative max-w-[94%] sm:max-w-[85%] w-full rounded-lg overflow-hidden
                        bg-gray-900 dark:bg-gray-950 border border-gray-700 dark:border-gray-700"
             style={{ opacity: alpha }}>
          {/* Title bar */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 dark:bg-gray-900
                          border-b border-gray-700 dark:border-gray-800">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span className="w-2 h-2 rounded-full bg-yellow-400" />
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-[10px] text-gray-400 ml-1 font-mono uppercase tracking-wide">
              Sandbox
            </span>
            <span className="flex-1" />
            {hasDebug && (
              <button onClick={() => toggleDebug(message.turn_id!)}
                      className="p-0.5 rounded text-gray-500 hover:text-purple-400 transition-colors">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
            )}
          </div>
          {/* Command */}
          <div className="px-3 py-2 font-mono text-xs text-green-400 whitespace-pre-wrap break-words">
            <span className="text-gray-500 select-none">$ </span>
            {cmd}
          </div>
        </div>
      </div>
    );
  }

  if (isSandboxResult) {
    const meta = message.metadata_json || {};
    const exitCode = meta.exit_code as number;
    return (
      <div className="flex justify-center py-1">
        <div className="relative max-w-[94%] sm:max-w-[85%] w-full rounded-b-lg overflow-hidden
                        bg-gray-950 dark:bg-black border border-gray-800 border-t-0"
             style={{ opacity: alpha }}>
          <div className="px-3 py-2 font-mono text-xs text-gray-300 whitespace-pre-wrap break-words
                          max-h-72 overflow-y-auto">
            {message.content}
          </div>
          <div className="flex items-center justify-between px-3 py-1 bg-gray-900/50
                          text-[10px] font-mono text-gray-500 border-t border-gray-800">
            <span className={exitCode === 0 ? 'text-green-400' : 'text-red-400'}>
              Exit: {exitCode}
            </span>
            {hasDebug && (
              <button onClick={() => toggleDebug(message.turn_id!)}
                      className="text-gray-500 hover:text-purple-400 transition-colors">
                Inspect
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span
          className="text-xs text-gray-500 dark:text-gray-400 italic px-3 py-1
                     bg-gray-200 dark:bg-gray-900 rounded-full max-w-[90%] text-center"
          style={{ opacity: alpha }}
        >
          {message.content}
        </span>
      </div>
    );
  }

  // Pending style: dashed border (turn_id = null, waiting for AI to decide)
  const bubbleStyle: React.CSSProperties = { opacity: alpha };
  if (isPending) {
    bubbleStyle.borderStyle = 'dashed';
  }

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} group`}>
      {/* Role label */}
      <span
        className="text-[10px] px-1 mb-0.5 font-mono text-gray-400 dark:text-gray-600"
        style={{ opacity: alpha }}
      >
        {message.role}
        {isPending && (
          <span className="ml-1 text-yellow-500 dark:text-yellow-400">· queued</span>
        )}
      </span>

      {/* Bubble */}
      <div
        className={`relative max-w-[88%] sm:max-w-[75%] rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 text-sm leading-relaxed min-w-0
          ${isUser
            ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200 rounded-br-md'
            : 'bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-bl-md border border-gray-200 dark:border-gray-800'
          }
          ${isPending
            ? '!border-dashed !border-yellow-400/60 dark:!border-yellow-600/40'
            : ''
          }`}
        style={bubbleStyle}
      >
        <div className="message-content whitespace-pre-wrap break-words overflow-hidden">
          {message.content}
        </div>

        {/* File attachments */}
        <FileAttachments message={message} />

        {/* Inspect button — only for messages with debug data */}
        {hasDebug && (
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

        {/* Continuation badge */}
        {hasContinuations && isAssistant && (
          <span className="inline-block ml-1 text-[10px] text-purple-500 dark:text-purple-400 font-mono">
            (+{'>'})
          </span>
        )}
      </div>

      {/* Turn number */}
      {hasDebug && (
        <div className={`mt-1 flex items-center gap-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[10px] text-gray-400 dark:text-gray-600 font-mono">
            Turn #{message.turn_id?.slice(-6)}
          </span>
        </div>
      )}
    </div>
  );
}

/** Renders file attachments from message metadata. */
function FileAttachments({ message }: { message: Message }) {
  const meta = message.metadata_json;
  if (!meta) return null;

  const fileUrls = meta.file_urls as string[] | undefined;
  const files = meta.files as string[] | undefined;
  if (!fileUrls || !files || fileUrls.length === 0) return null;

  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'];

  return (
    <div className="mt-2 space-y-2">
      {files.map((filePath, i) => {
        const url = fileUrls[i] || '';
        const fileName = filePath.replace(/^\/workspace\//, '');
        const isImage = imageExts.some(ext => fileName.toLowerCase().endsWith(ext));

        if (isImage) {
          return (
            <div key={i} className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950">
              <img
                src={url}
                alt={fileName}
                className="max-w-full max-h-80 object-contain mx-auto"
                loading="lazy"
              />
              <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">{fileName}</span>
                <a
                  href={url}
                  download={fileName}
                  className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline font-medium"
                >
                  Download
                </a>
              </div>
            </div>
          );
        }

        return (
          <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg
                                  bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-xs text-gray-700 dark:text-gray-300 font-mono truncate">{fileName}</span>
            <a
              href={url}
              download={fileName}
              className="ml-auto text-[10px] text-purple-600 dark:text-purple-400 hover:underline font-medium shrink-0"
            >
              Download
            </a>
          </div>
        );
      })}
    </div>
  );
}
