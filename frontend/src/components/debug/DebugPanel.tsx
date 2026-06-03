import { useEffect, useState } from 'react';
import { useDebugPanel } from '../../contexts/DebugPanelContext';
import { JsonViewer } from './JsonViewer';
import { Spinner } from '../common/Spinner';
import * as api from '../../api/client';
import type { RawRequestData, RawResponseData } from '../../types';

type Tab = 'request' | 'response';

export function DebugPanel() {
  const { isOpen, activeTurnId, closeDebug } = useDebugPanel();

  if (!isOpen || !activeTurnId) return null;

  return <DebugPanelInner turnId={activeTurnId} onClose={closeDebug} />;
}

function DebugPanelInner({ turnId, onClose }: { turnId: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('request');
  const [loading, setLoading] = useState(true);
  const [rawRequest, setRawRequest] = useState<RawRequestData | null>(null);
  const [rawResponse, setRawResponse] = useState<RawResponseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      api.getRawRequest(turnId).catch(e => ({ _error: e.message })),
      api.getRawResponse(turnId).catch(e => ({ _error: e.message })),
    ]).then(([req, resp]) => {
      if (cancelled) return;
      if ('_error' in req) {
        setError((req as { _error: string })._error);
      } else {
        setRawRequest(req as RawRequestData);
      }
      if ('_error' in resp) {
        if (!error) setError((resp as { _error: string })._error);
      } else {
        setRawResponse(resp as RawResponseData);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [turnId]);

  const handleCopy = () => {
    const data = tab === 'request' ? rawRequest?.request_json : rawResponse?.response_json;
    if (data) {
      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const activeData = tab === 'request' ? rawRequest : rawResponse;

  return (
    <div className="fixed inset-0 z-40 flex flex-col md:flex-row">
      {/* Backdrop */}
      <div className="hidden md:block flex-1 bg-black/40" onClick={onClose} />

      {/* Panel — bottom sheet on mobile, side panel on desktop */}
      <div className="mt-20 md:mt-0 w-full md:w-[560px] md:max-w-[90vw] bg-gray-950
                      border-t md:border-l md:border-t-0 border-gray-800 flex flex-col shadow-2xl
                      rounded-t-xl md:rounded-none flex-1 md:flex-none
                      animate-[slideUp_0.25s_ease-out] md:animate-[slideIn_0.2s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-200">Raw API Inspector</h3>
            <span className="text-[10px] font-mono text-gray-600 bg-gray-900 px-2 py-0.5 rounded">
              Turn {turnId.slice(-8)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 shrink-0">
          <TabButton
            active={tab === 'request'}
            onClick={() => setTab('request')}
            label="Raw Request"
            icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            }
          />
          <TabButton
            active={tab === 'response'}
            onClick={() => setTab('response')}
            label="Raw Response"
            icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h3a1 1 0 001-1V10" />
              </svg>
            }
          />
        </div>

        {/* Meta info bar */}
        {activeData && (
          <div className="px-3 sm:px-4 py-2 bg-gray-900/50 border-b border-gray-800/50
                          flex items-center gap-2 sm:gap-4 text-[10px] text-gray-500 font-mono shrink-0
                          overflow-x-auto">
            {tab === 'request' && rawRequest && (
              <>
                <span>Provider: <span className="text-gray-400">{rawRequest.provider}</span></span>
                <span>Endpoint: <span className="text-gray-400 truncate max-w-[200px]">{rawRequest.endpoint_url}</span></span>
              </>
            )}
            {tab === 'response' && rawResponse && (
              <>
                <span>Status: <span className={rawResponse.http_status_code < 300 ? 'text-green-400' : 'text-red-400'}>
                  {rawResponse.http_status_code}
                </span></span>
                <span>Latency: <span className="text-gray-400">{rawResponse.latency_ms}ms</span></span>
                {rawResponse.token_usage_json && (
                  <span>
                    Tokens:{' '}
                    <span className="text-gray-400">
                      {Object.entries(rawResponse.token_usage_json)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(', ')}
                    </span>
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-950">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-3 text-gray-500">
                <Spinner />
                <span className="text-sm">Loading raw data...</span>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-red-400 text-sm mb-2">Failed to load data</p>
                <p className="text-gray-600 text-xs">{error}</p>
              </div>
            </div>
          ) : activeData ? (
            <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 overflow-x-auto">
              <JsonViewer
                data={tab === 'request' ? rawRequest!.request_json : rawResponse!.response_json}
              />
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between shrink-0">
          <p className="hidden sm:block text-[10px] text-gray-600">
            {tab === 'request'
              ? 'The exact payload sent to the LLM API — including system prompt, full message history, and all parameters.'
              : 'The exact response received from the LLM API — including choices, usage, and all provider-specific fields.'
            }
          </p>
          <button
            onClick={handleCopy}
            disabled={!activeData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                       bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700
                       hover:border-gray-600 transition-colors disabled:opacity-50 shrink-0"
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                Copy JSON
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors duration-150
        ${active
          ? 'text-purple-400 border-purple-500 bg-purple-500/5'
          : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-gray-900/50'
        }`}
    >
      {icon}
      {label}
    </button>
  );
}
