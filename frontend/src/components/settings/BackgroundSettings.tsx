import { useState, useEffect, useRef, useCallback, type DragEvent } from 'react';
import { useBackground } from '../../contexts/BackgroundContext';

interface Props { onClose: () => void; }
type Corner = 'tl' | 'tr' | 'bl' | 'br';

/* ── Grid canvas dimensions ─────────────────────────────────────── */
// The canvas is a 4:3 workspace. The image fits centered within it.
// Crop rect coordinates are fractions of the canvas (0–1).

function fitImage(imgW: number, imgH: number) {
  // Fit the image centered within the canvas, preserving aspect ratio
  const scale = Math.min(1 / imgW, 1 / imgH) * 0.85; // 85% of canvas at most
  const w = imgW * scale;
  const h = imgH * scale;
  const x = (1 - w) / 2;
  const y = (1 - h) / 2;
  return { x, y, w, h };
}

export function BackgroundSettings({ onClose }: Props) {
  const { config, updateConfig, resetConfig } = useBackground();
  const [img, setImg] = useState(config.image);
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const [brightness, setBrightness] = useState(config.brightness);
  const [opacity, setOpacity] = useState(config.opacity);
  const initialCrop = { x: config.cropX, y: config.cropY, w: config.cropW, h: config.cropH };
  const [crop, setCrop] = useState(initialCrop);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Image position within canvas
  const imgRect = imgNatural ? fitImage(imgNatural.w, imgNatural.h) : { x: 0, y: 0, w: 1, h: 1 };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const apply = useCallback((cx: number, cy: number, cw: number, ch: number) => {
    updateConfig({
      image: img, brightness, opacity,
      cropX: cx, cropY: cy, cropW: cw, cropH: ch,
      imgX: imgRect.x, imgY: imgRect.y, imgW: imgRect.w, imgH: imgRect.h,
    });
  }, [img, brightness, opacity, imgRect, updateConfig]);

  // ── File handling ──────────────────────────────────────────────

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imgEl = new Image();
      imgEl.onload = () => {
        const maxW = 1920; let w = imgEl.width, h = imgEl.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        setImgNatural({ w, h });
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(imgEl, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setImg(dataUrl);
        // Default crop: full image area
        const r = fitImage(w, h);
        const def = { x: r.x, y: r.y, w: r.w, h: r.h };
        setCrop(def);
        apply(def.x, def.y, def.w, def.h);
      };
      imgEl.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); };
  const handleSave = () => { apply(crop.x, crop.y, crop.w, crop.h); onClose(); };
  const handleRemove = () => { resetConfig(); setImg(null); setImgNatural(null); setCrop({ x: 0, y: 0, w: 1, h: 1 }); setBrightness(100); setOpacity(30); };

  // ── Unified drag (mouse + touch) ────────────────────────────────

  const dragRef = useRef<{
    corner: Corner | 'center';
    oppX: number; oppY: number;
    startRX: number; startRY: number;
    startCropX: number; startCropY: number; startCropW: number; startCropH: number;
  } | null>(null);

  const getFractional = (clientX: number, clientY: number) => {
    const el = containerRef.current; if (!el) return { rx: 0, ry: 0 };
    const r = el.getBoundingClientRect();
    return { rx: (clientX - r.left) / r.width, ry: (clientY - r.top) / r.height };
  };

  const detect = (rx: number, ry: number): Corner | 'center' | null => {
    const m = 0.05;
    const c: Record<Corner, { x: number; y: number }> = {
      tl: { x: crop.x, y: crop.y }, tr: { x: crop.x + crop.w, y: crop.y },
      bl: { x: crop.x, y: crop.y + crop.h }, br: { x: crop.x + crop.w, y: crop.y + crop.h },
    };
    for (const [k, p] of Object.entries(c))
      if (Math.abs(rx - p.x) < m && Math.abs(ry - p.y) < m) return k as Corner;
    if (rx > crop.x && rx < crop.x + crop.w && ry > crop.y && ry < crop.y + crop.h) return 'center';
    return null;
  };

  const startDrag = (rx: number, ry: number) => {
    const hit = detect(rx, ry); if (!hit) return false;
    const opp: Record<string, { x: number; y: number }> = {
      tl: { x: crop.x + crop.w, y: crop.y + crop.h },
      tr: { x: crop.x, y: crop.y + crop.h },
      bl: { x: crop.x + crop.w, y: crop.y },
      br: { x: crop.x, y: crop.y },
      center: { x: crop.x, y: crop.y },
    };
    dragRef.current = { corner: hit, oppX: opp[hit].x, oppY: opp[hit].y,
      startRX: rx, startRY: ry, startCropX: crop.x, startCropY: crop.y, startCropW: crop.w, startCropH: crop.h };
    return true;
  };

  const moveDrag = (rx: number, ry: number) => {
    const d = dragRef.current; if (!d) return;
    let nx: number, ny: number, nw: number, nh: number;
    if (d.corner === 'center') {
      nx = d.startCropX + rx - d.startRX;
      ny = d.startCropY + ry - d.startRY;
      nw = d.startCropW; nh = d.startCropH;
      nx = Math.max(-0.5, Math.min(1.5 - nw, nx));
      ny = Math.max(-0.5, Math.min(1.5 - nh, ny));
    } else {
      nx = Math.min(rx, d.oppX); ny = Math.min(ry, d.oppY);
      nw = Math.max(0.02, Math.abs(rx - d.oppX));
      nh = Math.max(0.02, Math.abs(ry - d.oppY));
      if (rx > d.oppX) nx = d.oppX; else nx = d.oppX - nw;
      if (ry > d.oppY) ny = d.oppY; else ny = d.oppY - nh;
    }
    setCrop({ x: nx, y: ny, w: nw, h: nh });
    apply(nx, ny, nw, nh);
  };

  const endDrag = () => { dragRef.current = null; };

  // Mouse
  const onMouseDown = (e: React.MouseEvent) => {
    const { rx, ry } = getFractional(e.clientX, e.clientY);
    if (startDrag(rx, ry)) e.preventDefault();
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const { rx, ry } = getFractional(e.clientX, e.clientY);
    moveDrag(rx, ry);
  };
  const onMouseUp = () => endDrag();

  // Touch
  const touchId = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const { rx, ry } = getFractional(t.clientX, t.clientY);
    if (startDrag(rx, ry)) { touchId.current = t.identifier; e.preventDefault(); }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const t = Array.from(e.touches).find(t => t.identifier === touchId.current);
    if (!t) return;
    const { rx, ry } = getFractional(t.clientX, t.clientY);
    moveDrag(rx, ry);
    e.preventDefault();
  };
  const onTouchEnd = () => { touchId.current = null; endDrag(); };

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
            <label className={labelCls}>Crop — drag corners or center to move</label>
            {img ? (
              <div
                ref={containerRef}
                className="relative w-full rounded-lg overflow-hidden select-none touch-none"
                style={{ aspectRatio: '4/3', background: `
                  repeating-conic-gradient(#e5e5e5 0% 25%, transparent 0% 50%) 50% / 20px 20px
                ` }}
                onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
                onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
              >
                {/* Image centered in canvas */}
                <img
                  src={img} alt="" draggable={false}
                  className="absolute pointer-events-none"
                  style={{
                    left: `${imgRect.x * 100}%`, top: `${imgRect.y * 100}%`,
                    width: `${imgRect.w * 100}%`, height: `${imgRect.h * 100}%`,
                    objectFit: 'contain', filter: `brightness(${brightness}%)`,
                  }}
                />

                {/* Crop rect — solid border, mask outside */}
                <div className="absolute inset-0">
                  <div
                    className="absolute border-2 border-purple-400"
                    style={{
                      left: `${crop.x * 100}%`, top: `${crop.y * 100}%`,
                      width: `${crop.w * 100}%`, height: `${crop.h * 100}%`,
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                    }}
                  >
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                      {Array.from({ length: 9 }).map((_, i) => <div key={i} className="border-[0.5px] border-white/25" />)}
                    </div>
                    {(['tl','tr','bl','br'] as Corner[]).map(cn => {
                      const pos: Record<Corner, string> = {
                        tl: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2',
                        tr: 'top-0 right-0 translate-x-1/2 -translate-y-1/2',
                        bl: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2',
                        br: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2',
                      };
                      return <div key={cn} className={`absolute ${pos[cn]} w-5 h-5 bg-white border-2 border-purple-500 rounded-sm shadow z-10`} />;
                    })}
                  </div>
                </div>

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

          <div>
            <label className={labelCls}>Brightness <span className="text-gray-400 dark:text-gray-600 font-mono">({brightness}%)</span></label>
            <input type="range" min={0} max={200} value={brightness}
                   onChange={e => { const v = Number(e.target.value); setBrightness(v); apply(crop.x, crop.y, crop.w, crop.h); }}
                   className="w-full accent-purple-500" />
          </div>
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
