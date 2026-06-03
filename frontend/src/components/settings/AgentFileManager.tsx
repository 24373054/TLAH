import { useState, useEffect, useRef, type DragEvent } from 'react';
import { Spinner } from '../common/Spinner';
import * as api from '../../api/client';
import type { AgentFileData } from '../../types';

interface Props {
  chatId: string;
  onClose: () => void;
  onUpdate: (af: AgentFileData | null) => void;
}

export function AgentFileManager({ chatId, onClose, onUpdate }: Props) {
  const [loading, setLoading] = useState(false);
  const [agentFile, setAgentFile] = useState<AgentFileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing agent file on mount
  useEffect(() => {
    api.getAgentFile(chatId)
      .then(af => { setAgentFile(af); })
      .catch(() => { /* no agent file yet */ });
  }, [chatId]);

  const handleUpload = async (file: File) => {
    if (!file.name.endsWith('.md')) {
      setError('Only .md files are allowed');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const af = await api.uploadAgentFile(chatId, file);
      setAgentFile(af);
      onUpdate(af);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Remove AGENT.md from this chat?')) return;
    setLoading(true);
    try {
      await api.deleteAgentFile(chatId);
      setAgentFile(null);
      onUpdate(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
         onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 md:rounded-xl w-full max-w-lg md:mx-4 shadow-2xl h-full md:max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-sm font-semibold text-gray-200">AGENT.md</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs text-gray-500">
            Upload an AGENT.md file to define the chatbot's identity, behavior, and domain knowledge.
            Its content will be appended to the system prompt for every API call in this chat.
          </p>

          {/* Upload zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
              ${dragOver
                ? 'border-purple-500 bg-purple-500/10'
                : 'border-gray-700 hover:border-gray-600 bg-gray-900/50'
              }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".md"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
              className="hidden"
            />
            <svg className="w-8 h-8 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm text-gray-400 mb-1">
              Drop your AGENT.md here or <span className="text-purple-400">browse</span>
            </p>
            <p className="text-xs text-gray-600">Only .md files are accepted</p>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 text-gray-500 py-2">
              <Spinner className="w-4 h-4" />
              <span className="text-sm">Uploading...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Current file info */}
          {agentFile && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span className="text-sm text-gray-200 font-medium">{agentFile.filename}</span>
                </div>
                <button
                  onClick={handleDelete}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Remove
                </button>
              </div>
              <p className="text-xs text-gray-500">
                {agentFile.size_bytes.toLocaleString()} bytes · Uploaded {new Date(agentFile.created_at).toLocaleDateString()}
              </p>
              {/* Preview */}
              <div className="mt-2 bg-gray-950 rounded-lg border border-gray-800 p-3 max-h-40 overflow-y-auto">
                <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap">
                  {agentFile.content.slice(0, 500)}
                  {agentFile.content.length > 500 && (
                    <span className="text-gray-600">\n... ({agentFile.content.length - 500} more chars)</span>
                  )}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
