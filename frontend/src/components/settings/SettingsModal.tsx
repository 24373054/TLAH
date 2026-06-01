import { useState, useEffect } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { useChat } from '../../contexts/ChatContext';
import type { GlobalSettings } from '../../types';
import { Spinner } from '../common/Spinner';

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const { globalSettings, providers, saveGlobalSettings } = useSettings();
  const { state } = useChat();

  const [form, setForm] = useState<GlobalSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<'global' | 'chat'>('global');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (globalSettings) {
      setForm({ ...globalSettings });
    }
  }, [globalSettings]);

  const handleProviderChange = (key: string) => {
    if (!form) return;
    const p = providers.find(pr => pr.key === key);
    setForm({
      ...form,
      provider: key,
      base_url: p?.default_base_url ?? form.base_url,
      model: p?.default_model ?? form.model,
    });
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveGlobalSettings(form);
      setMessage('Settings saved successfully!');
      setTimeout(() => {
        setMessage(null);
        onClose();
      }, 1000);
    } catch (e) {
      setMessage(`Error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!form) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
           onClick={onClose}>
        <div className="bg-gray-900 rounded-xl p-8" onClick={e => e.stopPropagation()}>
          <Spinner />
        </div>
      </div>
    );
  }

  const selectedProvider = providers.find(p => p.key === form.provider);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
         onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between sticky top-0 bg-gray-900 rounded-t-xl">
          <h3 className="text-sm font-semibold text-gray-200">Settings</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Scope Toggle */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Apply to</label>
            <div className="flex gap-2">
              {(['global', 'chat'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  disabled={s === 'chat' && !state.currentChatId}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                    ${scope === s
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700'
                    }
                    disabled:opacity-30 disabled:cursor-not-allowed`}
                >
                  {s === 'global' ? 'All Chats' : 'This Chat Only'}
                </button>
              ))}
            </div>
            {scope === 'chat' && !state.currentChatId && (
              <p className="text-[10px] text-gray-600 mt-1">Open a chat first to configure per-chat settings.</p>
            )}
          </div>

          {/* Provider */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Provider</label>
            <select
              value={form.provider}
              onChange={e => handleProviderChange(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100
                         focus:outline-none focus:border-purple-500"
            >
              {providers.map(p => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">API Key</label>
            <input
              type="password"
              value={form.api_key}
              onChange={e => setForm({ ...form, api_key: e.target.value })}
              placeholder="sk-..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100
                         font-mono focus:outline-none focus:border-purple-500 placeholder:text-gray-600"
            />
            {form.api_key && (
              <p className="text-[10px] text-gray-600 mt-1">
                Current: {form.api_key.slice(0, 8)}...{form.api_key.slice(-4)}
              </p>
            )}
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Base URL</label>
            <input
              type="text"
              value={form.base_url}
              onChange={e => setForm({ ...form, base_url: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100
                         font-mono focus:outline-none focus:border-purple-500"
            />
            {selectedProvider && form.base_url !== selectedProvider.default_base_url && (
              <button
                onClick={() => setForm({ ...form, base_url: selectedProvider.default_base_url })}
                className="text-[10px] text-purple-400 hover:text-purple-300 mt-1"
              >
                Reset to default ({selectedProvider.default_base_url})
              </button>
            )}
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Model</label>
            <input
              type="text"
              value={form.model}
              onChange={e => setForm({ ...form, model: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100
                         font-mono focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Temperature & Max Tokens row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Temperature <span className="text-gray-600">({form.temperature})</span>
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={form.temperature}
                onChange={e => setForm({ ...form, temperature: parseFloat(e.target.value) })}
                className="w-full accent-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Max Tokens</label>
              <input
                type="number"
                min={1}
                max={200000}
                value={form.max_tokens}
                onChange={e => setForm({ ...form, max_tokens: parseInt(e.target.value) || 4096 })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100
                           focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">
              Default System Prompt
            </label>
            <textarea
              value={form.system_prompt}
              onChange={e => setForm({ ...form, system_prompt: e.target.value })}
              rows={4}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-gray-100
                         font-mono focus:outline-none focus:border-purple-500 resize-none"
              placeholder="You are a helpful assistant."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 flex items-center justify-between sticky bottom-0 bg-gray-900 rounded-b-xl">
          {message && (
            <p className={`text-xs ${message.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
              {message}
            </p>
          )}
          <div className="flex-1" />
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg
                         transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg
                         font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {saving && <Spinner className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
