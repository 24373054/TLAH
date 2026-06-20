import { useEffect, useMemo, useRef } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { MessageBubble } from './MessageBubble';
import { Spinner } from '../common/Spinner';
import type { Message, TurnMeta } from '../../types';

interface MessageGroup {
  turnId: string | null;
  messages: Message[];
  turnMeta?: TurnMeta; // from ChatDetail.turns
  isPending: boolean;
}

export function MessageList() {
  const { state } = useChat();
  const { currentChat, sending, polling } = state;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChat?.messages, sending, polling]);

  if (!currentChat) return null;

  const messages = currentChat.messages || [];
  const turns = currentChat.turns || [];
  const turnMap = new Map(turns.map(t => [t.id, t]));

  // Group messages by turn_id
  const groups = useMemo(() => {
    const result: MessageGroup[] = [];
    let current: MessageGroup | null = null;

    for (const msg of messages) {
      const tid = msg.turn_id;
      if (!current || current.turnId !== tid) {
        if (current) result.push(current);
        current = {
          turnId: tid,
          messages: [msg],
          turnMeta: tid ? turnMap.get(tid) : undefined,
          isPending: tid === null,
        };
      } else {
        current.messages.push(msg);
      }
    }
    if (current) result.push(current);
    return result;
  }, [messages, turnMap]);

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-3">
      {messages.length === 0 && !sending && (
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-400 dark:text-gray-500 text-sm">
            Send a message to start debugging prompts
          </p>
        </div>
      )}

      {groups.map((group, idx) => (
        <TurnGroup key={group.turnId ?? `pending-${idx}`} group={group} />
      ))}

      {/* Show thinking indicator during polling (async harness) or sending (legacy) */}
      {(sending || polling) && (
        <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
          <div className="w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-600/20 flex items-center justify-center">
            <Spinner className="text-purple-600 dark:text-purple-400 w-4 h-4" />
          </div>
          <span className="text-sm text-gray-400 dark:text-gray-500">
            {sending ? 'Sending...' : 'AI is thinking...'}
          </span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

/** Visual container for a group of messages sharing one Turn. */
function TurnGroup({ group }: { group: MessageGroup }) {
  const pending = group.isPending;
  const meta = group.turnMeta;
  const hasContinuations = meta && meta.child_turn_ids && meta.child_turn_ids.length > 0;

  return (
    <div
      className={`${
        pending
          ? 'relative rounded-lg border border-dashed border-yellow-400/60 dark:border-yellow-600/40 bg-yellow-50/30 dark:bg-yellow-900/10'
          : ''
      }`}
    >
      {/* Pending indicator */}
      {pending && (
        <div className="flex items-center gap-1.5 px-2 pt-2 pb-0.5">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-[10px] font-medium text-yellow-700 dark:text-yellow-400 uppercase tracking-wide">
            Waiting for reply...
          </span>
        </div>
      )}

      {/* Messages */}
      <div className={pending ? 'space-y-0.5 px-1 pb-1' : 'space-y-0.5'}>
        {group.messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isPending={pending}
            hasContinuations={hasContinuations}
          />
        ))}
      </div>

      {/* Continuation indicator */}
      {hasContinuations && meta && (
        <div className="text-[10px] text-purple-500 dark:text-purple-400 px-2 pb-1 font-mono">
          +{meta.child_turn_ids.length} continuation{meta.child_turn_ids.length > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
