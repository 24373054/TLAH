import { useState, useEffect, useRef, type DragEvent } from 'react';
import { useBackground } from '../../contexts/BackgroundContext';

interface Props { onClose: () => void; }

type Corner = 'tl' | 'tr' | 'bl' | 'br';

export function BackgroundSettings({ onClose }: Props) {
  const { config, updateConfig, resetConfig } = useBackground();
  const [img, setImg] = useState(config.image);
  const [brightness, setBrightness] = useState(config.brightness);
  const [opacity, setOpacity] = useState(config.opacity);
  const [crop, setCrop] = useState({ x: config.cropX, y: config.cropY, w: config.cropW, h: config.cropH });
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const apply = (cx: number, cy: number, cw: number, ch: number) => {
    updateConfig({ image: img, brightness, opacity, cropX: cx, cropY: cy, cropW: cw, cropH: ch });
  };

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
        const def = { x: 0, y: 0, w: 1, h: 1 };
        setCrop(def);
        apply(def.x, def.y, def.w, def.h);
      };
      imgEl.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); };

  const handleSave = () => { apply(crop.x, crop.y, crop.w, crop.h); onClose(); };
  const handleRemove = () => { resetConfig(); setImg(null); setCrop({ x: 0, y: 0, w: 1, h: 1 }); setBrightness(100); setOpacity(30); };

  // ── Drag logic — free-form, opposite corner stays fixed ────────

  const dragRef = useRef<{
    corner: Corner | 'center';
    oppX: number;  // opposite corner (fixed) as fraction
    oppY: number;
    startCropX: number; startCropY: number; startCropW: number; startCropH: number;
  } | null>(null);

  const detectCorner = (rx: number, ry: number): Corner | 'center' | null => {
    const margin = 0.04;
    const corners: Record<Corner, { x: number; y: number }> = {
      tl: { x: crop.x, y: crop.y },
      tr: { x: crop.x + crop.w, y: crop.y },
      bl: { x: crop.x, y: crop.y + crop.h },
      br: { x: crop.x + crop.w, y: crop.y + crop.h },
    };
    for (const [key, pos] of Object.entries(corners)) {
      if (Math.abs(rx - pos.x) < margin && Math.abs(ry - pos.y) < margin) return key as Corner;
    }
    if (rx > crop.x && rx < crop.x + crop.w && ry > crop.y && ry < crop.y + crop.h) return 'center';
    return null;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;
    const hit = detectCorner(rx, ry);
    if (!hit) return;
    e.preventDefault();

    const opp: Record<string, { x: number; y: number }> = {
      tl: { x: crop.x + crop.w, y: crop.y + crop.h },
      tr: { x: crop.x, y: crop.y + crop.h },
      bl: { x: crop.x + crop.w, y: crop.y },
      br: { x: crop.x, y: crop.y },
      center: { x: crop.x, y: crop.y },
    };

    dragRef.current = {
      corner: hit,
      oppX: opp[hit].x,
      oppY: opp[hit].y,
      startCropX: crop.x, startCropY: crop.y, startCropW: crop.w, startCropH: crop.h,
      _startRX: rx, _startRY: ry,  // store start mouse position for center drag
    } as any;
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const d = dragRef.current as any;
    if (!d) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;

    let nx = crop.x, ny = crop.y, nw = crop.w, nh = crop.h;

    if (d.corner === 'center') {
      const dx = rx - d._startRX;
      const dy = ry - d._startRY;
      nx = d.startCropX + dx;
      ny = d.startCropY + dy;
      nw = d.startCropW;
      nh = d.startCropH;
      // Clamp to keep rect within [0,1]
      nx = Math.max(0, Math.min(1 - nw, nx));
      ny = Math.max(0, Math.min(1 - nh, ny));
    } else {
      const oppX = d.oppX, oppY = d.oppY;
      nx = Math.min(rx, oppX);
      ny = Math.min(ry, oppY);
      nw = Math.abs(rx - oppX);
      nh = Math.abs(ry - oppY);
      if (nw < 0.02) nw = 0.02;
      if (nh < 0.02) nh = 0.02;
      // Recompute nx,ny from opposite
      if (rx > oppX) nx = oppX; else nx = oppX - nw;
      if (ry > oppY) ny = oppY; else ny = oppY - nh;
      nx = Math.max(0, nx); ny = Math.max(0, ny);
      nw = Math.min(1 - nx, nw); nh = Math.min(1 - ny, nh);
    }

    d._lastRX = rx; d._lastRY = ry;
    setCrop({ x: nx, y: ny, w: nw, h: nh });
    apply(nx, ny, nw, nh);
  };

  const onMouseUp = () => { dragRef.current = null; };

  // ── Render ─────────────────────────────────────────────────────

  const labelCls = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 md:rounded-xl
                      w-full max-w-xl md:mx-4 shadow-2xl h-full md:max-h-[95vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-900 z-10">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-200">Chat Background</h3>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-4 space-y-5">
          <div>
            <label className={labelCls}>Crop — drag corners (opposite stays fixed) or center to move</label>
            {img ? (
              <div
                ref={containerRef}
                className="relative w-full rounded-lg overflow-hidden bg-gray-800 select-none"
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
              >
                {/* Image — contain so the full image is always visible */}
                <img
                  src={img}
                  alt=""
                  draggable={false}
                  className="w-full h-auto block pointer-events-none"
                  style={{ filter: `brightness(${brightness}%)` }}
                />

                {/* Crop overlay — absolute positioned over the image */}
                <div className="absolute inset-0">
                  {/* Dark masks */}
                  <div className="absolute inset-0 bg-black/50" />
                  <div
                    className="absolute border-2 border-purple-400"
                    style={{
                      left: `${crop.x * 100}%`, top: `${crop.y * 100}%`,
                      width: `${crop.w * 100}%`, height: `${crop.h * 100}%`,
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                    }}
                  >
                    {/* Grid lines */}
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} className="border-[0.5px] border-white/25" />
                      ))}
                    </div>

                    {/* Corner handles */}
                    {(['tl', 'tr', 'bl', 'br'] as Corner[]).map(cn => {
                      const corners: Record<Corner, string> = {
                        tl: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2',
                        tr: 'top-0 right-0 translate-x-1/2 -translate-y-1/2',
                        bl: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2',
                        br: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2',
                      };
                      return (
                        <div key={cn}
                          className={`absolute ${corners[cn]} w-4 h-4 bg-white border-2 border-purple-500 rounded-sm cursor-nwse-resize shadow z-10`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Hint */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-white/70 bg-black/50 px-2 py-1 rounded pointer-events-none z-20">
                  Drag corners to crop · Drag center to move
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
                   onChange={e => { const v = Number(e.target.value); setBrightness(v); apply(crop.x, crop.y, crop.w, crop.h); }}
                   className="w-full accent-purple-500" />
          </div>

          {/* Opacity */}
          <div>
            <label className={labelCls}>Opacity <span className="text-gray-400 dark:text-gray-600 font-mono">({opacity}%)</span></label>
            <input type="range" min={0} max={100} value={opacity}
                   onChange={e => { const v = Number(e.target.value); setOpacity(v); apply(crop.x, crop.y, crop.w, crop.h); }}
                   className="w-full accent-purple-500" />
          </div>
        </div>

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
