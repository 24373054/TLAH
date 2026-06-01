import { useState, Fragment } from 'react';

/* ═══════════════════════════════════════════════════════════════════
   JsonViewer — recursive collapsible JSON tree

   Renders JSON into properly indented, color-coded, collapsible HTML
   using explicit <br/> line-breaks and pixel-based paddingLeft.
   No escapeHtml() needed here: React JSX text children are rendered
   via textContent, which never interprets HTML entities, so we pass
   strings through verbatim.
   ═══════════════════════════════════════════════════════════════════ */

interface Props {
  data: unknown;
  initialExpanded?: boolean;
  maxDepth?: number;
}

const INDENT = 18; // px per depth level

export function JsonViewer({ data, initialExpanded = true, maxDepth = 10 }: Props) {
  const formatted = JSON.stringify(data, null, 2);

  return (
    <div className="font-mono text-xs leading-relaxed">
      <button
        onClick={() => navigator.clipboard.writeText(formatted)}
        className="mb-2 px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700
                   text-gray-400 hover:text-gray-200 rounded border
                   border-gray-700 transition-colors"
      >
        📋 Copy formatted JSON
      </button>
      <div className="bg-gray-950 rounded-lg border border-gray-800/50 p-3 overflow-x-auto">
        <Node value={data} depth={0} initialExpanded={initialExpanded} maxDepth={maxDepth} path="" />
      </div>
    </div>
  );
}

/* ── Leaf scalars ────────────────────────────────────────────────── */

function Leaf({ value, path }: { value: unknown; path: string }) {
  if (value === null) return <span className="text-gray-500">null</span>;
  if (value === undefined) return <span className="text-gray-500">undefined</span>;
  if (typeof value === 'boolean')
    return <span className="text-red-400">{String(value)}</span>;
  if (typeof value === 'number')
    return <span className="text-orange-400">{value}</span>;
  if (typeof value === 'string')
    return <String_ value={value} path={path} />;
  return <span className="text-gray-400">{String(value)}</span>;
}

function String_({ value, path }: { value: string; path: string }) {
  const [open, setOpen] = useState(false);

  // Mask api-key / authorization fields
  const lo = path.toLowerCase();
  if (lo.includes('api_key') || lo.includes('authorization') || lo.includes('x-api-key')) {
    return (
      <span className="text-yellow-500">
        "<span className="text-gray-600">***REDACTED***</span>"
      </span>
    );
  }

  /*
   * Re-encode the string via JSON.stringify so that escape sequences
   * (\n, \", \\, \t, etc.) appear LITERALLY in the rendered output —
   * exactly as they do in the raw JSON stored in the database.
   *
   * JSON.stringify wraps the result in outer quotes; .slice(1,-1)
   * strips them because we render our own color-coded quotes.
   */
  const escaped = JSON.stringify(value).slice(1, -1);
  const long = escaped.length > 150;

  if (!long) {
    return <span className="text-green-400">"{escaped}"</span>;
  }

  return (
    <span>
      <span className="text-green-400">
        "{open ? escaped : escaped.slice(0, 150)}"
      </span>
      {!open && <span className="text-gray-500">…</span>}
      <button
        onClick={() => setOpen(!open)}
        className="ml-1 text-purple-400 hover:text-purple-300 text-[10px]"
      >
        {open ? '[show less]' : `[show all ${escaped.length} chars]`}
      </button>
    </span>
  );
}

/* ── Object ──────────────────────────────────────────────────────── */

function Obj({
  value,
  depth,
  initialExpanded,
  maxDepth,
  path,
}: {
  value: Record<string, unknown>;
  depth: number;
  initialExpanded: boolean;
  maxDepth: number;
  path: string;
}) {
  const [open, setOpen] = useState(initialExpanded && depth < maxDepth);
  const entries = Object.entries(value);
  const pl = depth * INDENT;

  if (entries.length === 0) return <span className="text-gray-500">{'{}'}</span>;

  return (
    <span>
      {/* opening line */}
      <Toggle open={open} setOpen={setOpen} />
      <span className="text-gray-400">{'{'}</span>
      {!open && (
        <span className="text-gray-600">
          {' '}{entries.length} {entries.length === 1 ? 'key' : 'keys'}{' '}
        </span>
      )}
      {!open && <span className="text-gray-400">{'}'}</span>}

      {/* body */}
      {open && (
        <>
          {entries.map(([k, v], i) => (
            <Fragment key={k}>
              <br />
              <span style={{ paddingLeft: pl + INDENT }}>
                <span className="text-purple-400">"{k}"</span>
                <span className="text-gray-500">: </span>
                <Node
                  value={v}
                  depth={depth + 1}
                  initialExpanded={depth + 1 < 2}
                  maxDepth={maxDepth}
                  path={`${path}.${k}`}
                />
                {i < entries.length - 1 && <span className="text-gray-500">,</span>}
              </span>
            </Fragment>
          ))}
          <br />
          <span style={{ paddingLeft: pl }}>
            <span className="text-gray-400">{'}'}</span>
          </span>
        </>
      )}
    </span>
  );
}

/* ── Array ───────────────────────────────────────────────────────── */

function Arr({
  value,
  depth,
  initialExpanded,
  maxDepth,
  path,
}: {
  value: unknown[];
  depth: number;
  initialExpanded: boolean;
  maxDepth: number;
  path: string;
}) {
  const [open, setOpen] = useState(initialExpanded && depth < maxDepth);
  const pl = depth * INDENT;

  if (value.length === 0) return <span className="text-gray-500">{'[]'}</span>;

  return (
    <span>
      {/* opening line */}
      <Toggle open={open} setOpen={setOpen} />
      <span className="text-gray-400">{'['}</span>
      {!open && (
        <span className="text-gray-600">
          {' '}{value.length} {value.length === 1 ? 'item' : 'items'}{' '}
        </span>
      )}
      {!open && <span className="text-gray-400">{']'}</span>}

      {/* body */}
      {open && (
        <>
          {value.map((item, i) => (
            <Fragment key={i}>
              <br />
              <span style={{ paddingLeft: pl + INDENT }}>
                <Node
                  value={item}
                  depth={depth + 1}
                  initialExpanded={depth + 1 < 2}
                  maxDepth={maxDepth}
                  path={`${path}[${i}]`}
                />
                {i < value.length - 1 && <span className="text-gray-500">,</span>}
              </span>
            </Fragment>
          ))}
          <br />
          <span style={{ paddingLeft: pl }}>
            <span className="text-gray-400">{']'}</span>
          </span>
        </>
      )}
    </span>
  );
}

/* ── Toggle button ───────────────────────────────────────────────── */

function Toggle({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <button
      onClick={() => setOpen(!open)}
      className="inline-flex items-center justify-center w-4 h-4 mr-0.5
                 text-gray-500 hover:text-gray-300 align-middle
                 rounded-sm hover:bg-gray-800 transition-colors select-none"
    >
      <span className="text-[9px] leading-none">{open ? '▼' : '▶'}</span>
    </button>
  );
}

/* ── Dispatcher ──────────────────────────────────────────────────── */

function Node(p: {
  value: unknown;
  depth: number;
  initialExpanded: boolean;
  maxDepth: number;
  path: string;
}) {
  const { value, ...rest } = p;
  if (value === null || value === undefined || typeof value === 'boolean' ||
      typeof value === 'number' || typeof value === 'string') {
    return <Leaf value={value} path={p.path} />;
  }
  if (Array.isArray(value)) return <Arr value={value} {...rest} />;
  if (typeof value === 'object') return <Obj value={value as Record<string, unknown>} {...rest} />;
  return <span className="text-gray-400">{String(value)}</span>;
}
