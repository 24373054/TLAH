import { useState, type ReactNode } from 'react';

const STORAGE_KEY = 'tlah-beta-verified';

function isVerified(): boolean {
  try { return sessionStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

function setVerified(): void {
  try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch {}
}

export function BetaGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(isVerified);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/verify-beta-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (data.valid) {
        setVerified();
        setAuthed(true);
      } else {
        setError('Invalid access code');
      }
    } catch {
      setError('Network error, try again');
    } finally {
      setLoading(false);
    }
  };

  if (authed) return <>{children}</>;

  return (
    <div className="h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-100 mb-2">TLAH</h1>
          <p className="text-sm text-gray-500">Talk Like A Human · Private Beta</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={code}
              onChange={e => { setCode(e.target.value); setError(''); }}
              placeholder="Enter access code"
              autoFocus
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3
                         text-center text-gray-100 text-lg tracking-widest font-mono
                         placeholder-gray-600 focus:outline-none focus:border-purple-500
                         transition-colors"
            />
            {error && (
              <p className="text-red-400 text-xs text-center mt-2">{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-800
                       disabled:text-gray-600 text-white font-medium rounded-xl
                       transition-colors duration-150"
          >
            {loading ? 'Verifying...' : 'Enter'}
          </button>
        </form>

        <p className="text-gray-600 text-xs text-center mt-6">
          This instance is restricted to authorized testers.
        </p>
      </div>
    </div>
  );
}
