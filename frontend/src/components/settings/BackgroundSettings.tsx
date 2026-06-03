import { useState, useEffect, useRef, useCallback, type DragEvent } from 'react';
import { useBackground } from '../../contexts/BackgroundContext';

interface Props { onClose: () => void; }

/* ── Helpers: crop rect ↔ BgConfig ─────────────────────────────── */

// Image is always fitted to the container (cover).
// The crop rect is defined as fractions of the container: x, y, w.
// Height is derived from w divided by the device aspect ratio.
// This maps to BgConfig zoom/posX/posY.

function cropToConfig(cx: number, cy: number, cw: number, ar: number, img: string | null, bri: number, opa: number) {
  // zoom: 100 = fit; cw=1 means no zoom (fit); cw=0.5 means 2x zoom
  const zoom = Math.round(100 / cw);
  // posX/Y: center of the crop rect as percentage of the container
  const posX = Math.round((cx + cw / 2) * 100);
  const posY = Math.round((cy + (cw / ar) / 2) * 100);
  return { image: img, brightness: bri, opacity: opa, zoom, posX, posY };
}

function configToCrop(zoom: number, posX: number, posY: number, ar: number) {
  const cw = 100 / zoom; // fraction of container width
  const ch = cw / ar;
  const cx = Math.max(0, Math.min(1 - cw, (posX / 100) - cw / 2));
  const cy = Math.max(0, Math.min(1 - ch, (posY / 100) - ch / 2));
  return { x: cx, y: cy, w: cw, h: ch };
}

/* ── Handle types ───────────────────────────────────────────────── */

type Handle = 'tl' | 'tr' | 'bl' | 'br' | 'tm' | 'bm' | 'ml' | 'mr' | 'center';

export function BackgroundSettings({ onClose }: Props) {
  const { config, updateConfig, resetConfig } = useBackground();
  const [img, setImg] = useState(config.image);
  const [brightness, setBrightness] = useState(config.brightness);
  const [opacity, setOpacity] = useState(config.opacity);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Device aspect ratio for the crop frame
  const aspectRatio = window.innerWidth / Math.max(window.innerHeight, 1);

  // Crop rect state (fractions of container, 0–1)
  const initCrop = configToCrop(config.zoom, config.posX, config.posY, aspectRatio);
  const [crop, setCrop] = useState(initCrop);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const applyPreview = useCallback((cx: number, cy: number, cw: number) => {
    const p = cropToConfig(cx, cy, cw, aspectRatio, img, brightness, opacity);
    updateConfig(p);
  }, [aspectRatio, img, brightness, opacity, updateConfig]);

  // ── File handling ──────────────────────────────────────────────

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imgEl = new Image();
      imgEl.onload = () => {
        const maxW = 1920;
        let w = imgEl.width, h = imgEl.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(imgEl, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setImg(dataUrl);
        // Default: crop covering 100% of container
        const defCrop = { x: 0, y: 0, w: 1, h: 1 / aspectRatio };
        setCrop(defCrop);
        applyPreview(defCrop.x, defCrop.y, defCrop.w);
      };
      imgEl.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); };

  const handleSave = () => { const p = cropToConfig(crop.x, crop.y, crop.w, aspectRatio, img, brightness, opacity); updateConfig(p); onClose(); };
  const handleRemove = () => {
    resetConfig(); setImg(null); setCrop({ x: 0, y: 0, w: 1, h: 1 / aspectRatio }); setBrightness(100); setOpacity(30);
  };

  // ── Drag logic for crop rect ───────────────────────────────────

  const dragRef = useRef<{
    handle: Handle;
    startMouseX: number;
    startMouseY: number;
    startCropX: number;
    startCropY: number;
    startCropW: number;
  } | null>(null);

  const getHandle = (e: React.MouseEvent): Handle => {
    const el = containerRef.current;
    if (!el) return 'center';
    const rect = el.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;
    const margin = 0.03; // 3% handle hit area

    const left = Math.abs(rx - crop.x) < margin;
    const right = Math.abs(rx - (crop.x + crop.w)) < margin;
    const top = Math.abs(ry - crop.y) < margin;
    const bottom = Math.abs(ry - (crop.y + crop.h)) < margin;
    const inRect = rx > crop.x - margin && rx < crop.x + crop.w + margin &&
                   ry > crop.y - margin && ry < crop.y + crop.h + margin;

    if (!inRect) return 'center'; // fallback, should not happen
    if (top && left) return 'tl';
    if (top && right) return 'tr';
    if (bottom && left) return 'bl';
    if (bottom && right) return 'br';
    if (top) return 'tm';
    if (bottom) return 'bm';
    if (left) return 'ml';
    if (right) return 'mr';
    return 'center';
  };

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const handle = getHandle(e);
    dragRef.current = {
      handle,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startCropX: crop.x,
      startCropY: crop.y,
      startCropW: crop.w,
    };
  };

  const clampCrop = (x: number, y: number, w: number, ar: number) => {
    const minW = 0.1;
    w = Math.max(minW, Math.min(1, w));
    const h2 = w / ar;
    x = Math.max(0, Math.min(1 - w, x));
    y = Math.max(0, Math.min(1 - h2, y));
    return { x, y, w, h: h2 };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;

    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - d.startMouseX) / rect.width;
    const dy = (e.clientY - d.startMouseY) / rect.height;

    let nx = d.startCropX, ny = d.startCropY, nw = d.startCropW;

    switch (d.handle) {
      case 'center':
        nx = d.startCropX + dx;
        ny = d.startCropY + dy;
        break;
      case 'tl':
        nw = d.startCropW - dx;
        nx = d.startCropX + dx;
        ny = d.startCropY + dx / aspectRatio; // maintain aspect ratio for corner
        { const dh = (d.startCropW - nw) / aspectRatio; ny = d.startCropY + dh; }
        break;
      case 'tr':
        nw = d.startCropW + dx;
        ny = d.startCropY - dx / aspectRatio;
        break;
      case 'bl':
        nw = d.startCropW - dx;
        nx = d.startCropX + dx;
        break;
      case 'br':
        nw = d.startCropW + dx;
        break;
      case 'tm':
        ny = d.startCropY + dy;
        nw = d.startCropW - dy * aspectRatio;
        break;
      case 'bm':
        nw = d.startCropW + dy * aspectRatio;
        break;
      case 'ml':
        nw = d.startCropW - dx;
        nx = d.startCropX + dx;
        break;
      case 'mr':
        nw = d.startCropW + dx;
        break;
    }

    const clamped = clampCrop(nx, ny, nw, aspectRatio);
    setCrop(clamped);
    applyPreview(clamped.x, clamped.y, clamped.w);
  };

  const onMouseUp = () => { dragRef.current = null; };

  // Touch support
  const touchRef = useRef<{ id: number | null; startX: number; startY: number; startCropX: number; startCropY: number; startCropW: number; handle: Handle } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rx = (t.clientX - rect.left) / rect.width;
    const ry = (t.clientY - rect.top) / rect.height;
    const margin = 0.04; // slightly larger for touch
    const left = Math.abs(rx - crop.x) < margin;
    const right = Math.abs(rx - (crop.x + crop.w)) < margin;
    const top = Math.abs(ry - crop.y) < margin;
    const bottom = Math.abs(ry - (crop.y + crop.h)) < margin;
    const inRect = rx > crop.x - margin && rx < crop.x + crop.w + margin &&
                   ry > crop.y - margin && ry < crop.y + crop.h + margin;
    if (!inRect) return;

    let handle: Handle = 'center';
    if (top && left) handle = 'tl';
    else if (top && right) handle = 'tr';
    else if (bottom && left) handle = 'bl';
    else if (bottom && right) handle = 'br';
    else if (top) handle = 'tm';
    else if (bottom) handle = 'bm';
    else if (left) handle = 'ml';
    else if (right) handle = 'mr';

    touchRef.current = { id: t.identifier, startX: t.clientX, startY: t.clientY, startCropX: crop.x, startCropY: crop.y, startCropW: crop.w, handle };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const td = touchRef.current;
    if (!td) return;
    const t = Array.from(e.touches).find(t => t.identifier === td.id);
    if (!t) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (t.clientX - td.startX) / rect.width;
    const dy = (t.clientY - td.startY) / rect.height;
    // Same logic as mouse move — simplified: just drag 'center' style for touch
    let nx = td.startCropX + dx, ny = td.startCropY + dy, nw = td.startCropW;
    if (td.handle === 'br') nw = td.startCropW + dx;
    else if (td.handle === 'mr') nw = td.startCropW + dx;
    else if (td.handle === 'tr') { nw = td.startCropW + dx; ny = td.startCropY - dx / aspectRatio; }
    else if (td.handle === 'tl') { nw = td.startCropW - dx; nx = td.startCropX + dx; ny = td.startCropY + dx / aspectRatio; }
    else if (td.handle === 'bl') { nw = td.startCropW - dx; nx = td.startCropX + dx; }
    else if (td.handle === 'tm') { ny = td.startCropY + dy; nw = td.startCropW - dy * aspectRatio; }
    else if (td.handle === 'bm') { nw = td.startCropW + dy * aspectRatio; }
    else if (td.handle === 'ml') { nw = td.startCropW - dx; nx = td.startCropX + dx; }
    const clamped = clampCrop(nx, ny, nw, aspectRatio);
    setCrop(clamped);
    applyPreview(clamped.x, clamped.y, clamped.w);
  };

  const onTouchEnd = () => { touchRef.current = null; };

  // ── Render ─────────────────────────────────────────────────────

  const labelCls = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5";

  const ch = crop.w / aspectRatio;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 md:rounded-xl
                      w-full max-w-xl md:mx-4 shadow-2xl h-full md:max-h-[95vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-900 z-10">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-200">Chat Background</h3>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-4 space-y-5">
          <div>
            <label className={labelCls}>Crop & Position</label>
            {img ? (
              <div
                ref={containerRef}
                className="relative w-full rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-800 select-none"
                style={{ aspectRatio: `${aspectRatio}` }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              >
                {/* The full image — fitted to container */}
                <img
                  src={img}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  style={{ filter: `brightness(${brightness}%)`, opacity: opacity / 100 }}
                />

                {/* Dark mask outside the crop rect */}
                {/* Top mask */}
                <div className="absolute inset-x-0 top-0 bg-black/50 pointer-events-none" style={{ height: `${crop.y * 100}%` }} />
                {/* Bottom mask */}
                <div className="absolute inset-x-0 bottom-0 bg-black/50 pointer-events-none" style={{ height: `${(1 - crop.y - ch) * 100}%` }} />
                {/* Left mask */}
                <div className="absolute inset-y-0 left-0 bg-black/50 pointer-events-none" style={{ width: `${crop.x * 100}%` }} />
                {/* Right mask */}
                <div className="absolute inset-y-0 right-0 bg-black/50 pointer-events-none" style={{ width: `${(1 - crop.x - crop.w) * 100}%` }} />

                {/* Crop frame border */}
                <div
                  className="absolute border-2 border-purple-400 shadow-[0_0_0_1px_rgba(168,85,247,0.3)] pointer-events-none"
                  style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${ch * 100}%` }}
                >
                  {/* Grid lines */}
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} className="border-[0.5px] border-white/20" />
                    ))}
                  </div>
                </div>

                {/* Corner + edge handles */}
                {(['tl', 'tm', 'tr', 'ml', 'mr', 'bl', 'bm', 'br'] as Handle[]).map(hnd => {
                  const pos = handlePosition(hnd, crop.x, crop.y, crop.w, ch);
                  return (
                    <div
                      key={hnd}
                      className="absolute w-3 h-3 bg-white border-2 border-purple-500 rounded-sm shadow cursor-pointer z-10"
                      style={{ left: pos.left, top: pos.top, transform: 'translate(-50%, -50%)' }}
                    />
                  );
                })}

                {/* Hint */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-white/70 bg-black/50 px-2 py-1 rounded pointer-events-none">
                  Drag corners/edges to resize · Drag center to move
                </div>
              </div>
            ) : (
              <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
                   onClick={() => fileRef.current?.click()}
                   className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
                     ${dragOver ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/10' : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'}`}>
                <input ref={fileRef} type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} className="hidden" />
                <svg className="w-10 h-10 mx-auto mb-3 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <p className="text-sm text-gray-600 dark:text-gray-400">Drop an image or <span className="text-purple-600 dark:text-purple-400">browse</span></p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">JPEG/PNG (stored locally in your browser only)</p>
              </div>
            )}
            {img && <button onClick={handleRemove} className="mt-2 text-xs text-red-600 dark:text-red-400 hover:underline">Remove image</button>}
          </div>

          {/* Brightness */}
          <div>
            <label className={labelCls}>Brightness <span className="text-gray-400 dark:text-gray-600 font-mono">({brightness}%)</span></label>
            <input type="range" min={0} max={200} value={brightness}
                   onChange={e => { const v = Number(e.target.value); setBrightness(v); applyPreview(crop.x, crop.y, crop.w); }}
                   className="w-full accent-purple-500" />
          </div>

          {/* Opacity */}
          <div>
            <label className={labelCls}>Opacity <span className="text-gray-400 dark:text-gray-600 font-mono">({opacity}%)</span></label>
            <input type="range" min={0} max={100} value={opacity}
                   onChange={e => { const v = Number(e.target.value); setOpacity(v); applyPreview(crop.x, crop.y, crop.w); }}
                   className="w-full accent-purple-500" />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex justify-between sticky bottom-0 bg-white dark:bg-gray-900">
          <button onClick={handleRemove} className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors">Reset</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg transition-colors">Cancel</button>
            <button onClick={handleSave} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg font-medium transition-colors">Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Handle position helper ─────────────────────────────────────── */

function handlePosition(h: Handle, x: number, y: number, w: number, hh: number) {
  switch (h) {
    case 'tl': return { left: `${x * 100}%`, top: `${y * 100}%` };
    case 'tm': return { left: `${(x + w / 2) * 100}%`, top: `${y * 100}%` };
    case 'tr': return { left: `${(x + w) * 100}%`, top: `${y * 100}%` };
    case 'ml': return { left: `${x * 100}%`, top: `${(y + hh / 2) * 100}%` };
    case 'mr': return { left: `${(x + w) * 100}%`, top: `${(y + hh / 2) * 100}%` };
    case 'bl': return { left: `${x * 100}%`, top: `${(y + hh) * 100}%` };
    case 'bm': return { left: `${(x + w / 2) * 100}%`, top: `${(y + hh) * 100}%` };
    case 'br': return { left: `${(x + w) * 100}%`, top: `${(y + hh) * 100}%` };
    default: return { left: '0', top: '0' };
  }
}
