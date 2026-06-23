import { useState } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { AgentFileManager } from '../settings/AgentFileManager';
import * as api from '../../api/client';
import type { AgentFileData } from '../../types';

export function ChatHeader({ onMenuClick }: { onMenuClick?: () => void }) {
  const { state, updateSystemPrompt, updateTitle, selectChat } = useChat();
  const { currentChat } = state;
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [promptDraft, setPromptDraft] = useState('');
  const [showAgentFile, setShowAgentFile] = useState(false);
  const [agentFile, setAgentFile] = useState<AgentFileData | null>(null);
  const [agentFileLoaded, setAgentFileLoaded] = useState(false);
  const [showHarness, setShowHarness] = useState(false);
  const [harnessPrompt, setHarnessPrompt] = useState('');

  if (!currentChat) return null;

  const loadAgentFile = async () => {
    try {
      const af = await api.getAgentFile(currentChat.id);
      setAgentFile(af);
    } catch {
      setAgentFile(null);
    }
    setAgentFileLoaded(true);
  };

  const loadHarnessPrompt = async (agent?: boolean) => {
    try {
      const mode = agent ?? (currentChat?.agent_enabled !== false);
      const res = await fetch(`/api/harness-prompt?agent_mode=${mode}`);
      const data = await res.json();
      setHarnessPrompt(data.prompt || '');
    } catch {
      setHarnessPrompt('Failed to load harness prompt.');
    }
  };

  const handleSaveTitle = () => {
    if (titleDraft.trim()) updateTitle(titleDraft.trim());
    setEditingTitle(false);
  };

  const handleSavePrompt = () => {
    updateSystemPrompt(promptDraft);
    setEditingPrompt(false);
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-800 px-2 sm:px-4 py-2 sm:py-3 flex items-center gap-1 sm:gap-3 shrink-0">
      {/* Hamburger menu — mobile only */}
      <button
        onClick={onMenuClick}
        className="md:hidden p-1.5 rounded-lg text-gray-500 dark:text-gray-400
                   hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Title */}
      {editingTitle ? (
        <input
          autoFocus
          value={titleDraft}
          onChange={e => setTitleDraft(e.target.value)}
          onBlur={handleSaveTitle}
          onKeyDown={e => e.key === 'Enter' && handleSaveTitle()}
          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-2 py-1
                     text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-purple-500 w-32 sm:w-48"
        />
      ) : (
        <h2
          onClick={() => { setTitleDraft(currentChat.title); setEditingTitle(true); }}
          className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer
                     hover:text-gray-900 dark:hover:text-gray-100 px-1 sm:px-2 py-1 rounded
                     hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors truncate"
          title="Click to edit"
        >
          {currentChat.title}
        </h2>
      )}

      <div className="flex-1" />

      {/* System Prompt Button */}
      <button
        onClick={() => { setPromptDraft(currentChat.system_prompt || ''); setEditingPrompt(true); }}
        className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium
                   transition-colors duration-150 whitespace-nowrap
                   ${currentChat.system_prompt
                     ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700/50 hover:bg-purple-200 dark:hover:bg-purple-900/50'
                     : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-700 hover:text-gray-700 dark:hover:text-gray-200'
                   }`}
        title="Edit system prompt"
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        </svg>
        <span className="hidden sm:inline">System Prompt</span>
      </button>

      {/* AGENT.md Button */}
      <button
        onClick={() => { setShowAgentFile(true); loadAgentFile(); }}
        className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium whitespace-nowrap
                   transition-colors duration-150
                   ${agentFile && agentFileLoaded
                     ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700/50 hover:bg-green-200 dark:hover:bg-green-900/50'
                     : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-700 hover:text-gray-700 dark:hover:text-gray-200'
                   }`}
        title="Manage AGENT.md"
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="hidden sm:inline">AGENT.md</span>
        {agentFile && agentFileLoaded && (
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        )}
      </button>

      {/* Harness Prompt Button */}
      <button
        onClick={() => { setShowHarness(true); loadHarnessPrompt(); }}
        className="flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium whitespace-nowrap
                   transition-colors duration-150
                   bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300
                   border border-amber-300 dark:border-amber-700/50
                   hover:bg-amber-100 dark:hover:bg-amber-900/40"
        title="View harness decision prompt"
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <span className="hidden sm:inline">Harness</span>
      </button>

      {/* System Prompt Modal */}
      {editingPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
             onClick={() => setEditingPrompt(false)}>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl w-full max-w-2xl mx-4 shadow-2xl"
               onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-200">System Prompt</h3>
              <button onClick={() => setEditingPrompt(false)}
                      className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <textarea
                autoFocus
                value={promptDraft}
                onChange={e => setPromptDraft(e.target.value)}
                rows={12}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-3
                           text-sm text-gray-900 dark:text-gray-100 font-mono focus:outline-none focus:border-purple-500
                           resize-none placeholder-gray-400 dark:placeholder-gray-600"
                placeholder="You are a helpful assistant..."
              />
              <div className="flex justify-between items-center mt-3">
                <span className="text-xs text-gray-400 dark:text-gray-500">{promptDraft.length} characters</span>
                <button onClick={handleSavePrompt}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg font-medium transition-colors">
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AGENT.md Modal */}
      {showAgentFile && (
        <AgentFileManager
          chatId={currentChat.id}
          onClose={() => { setShowAgentFile(false); setAgentFileLoaded(false); }}
          onUpdate={(af) => setAgentFile(af)}
        />
      )}

      {/* Harness Modal (merged: Agent toggle + decision prompt) */}
      {showHarness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
             onClick={() => setShowHarness(false)}>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl w-full max-w-2xl mx-4 shadow-2xl max-h-[85vh] flex flex-col"
               onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-200">
                🤖 Harness
              </h3>
              <button onClick={() => setShowHarness(false)}
                      className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Agent toggle section */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
              <div>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  Agent Mode
                </span>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                  Sandbox shell access + autonomous multi-step execution
                </p>
              </div>
              <button
                onClick={async () => {
                  if (!currentChat) return;
                  const newVal = !currentChat.agent_enabled;
                  try {
                    await api.updateChat(currentChat.id, { agent_enabled: newVal });
                    // Reload chat from context then refresh the prompt
                    await selectChat(currentChat.id);
                    await loadHarnessPrompt(newVal);
                  } catch { /* ignore */ }
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0
                  ${currentChat?.agent_enabled !== false
                    ? 'bg-green-500'
                    : 'bg-gray-300 dark:bg-gray-600'
                  }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                  ${currentChat?.agent_enabled !== false ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Prompt section */}
            <div className="p-4 overflow-y-auto">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                This prompt is injected into every LLM call as part of the system instructions.
                {currentChat?.agent_enabled !== false
                  ? ' In agent mode, the sandbox tool definitions are also appended.'
                  : ''}
              </p>
              <pre className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4
                              text-xs text-gray-900 dark:text-gray-100 font-mono
                              whitespace-pre-wrap break-words overflow-x-auto max-h-[50vh]">
                {harnessPrompt || 'Loading...'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
