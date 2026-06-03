import { useState, useEffect, useRef, useCallback, type DragEvent, type WheelEvent, type TouchEvent } from 'react';
import { useBackground } from '../../contexts/BackgroundContext';

interface Props { onClose: () => void; }

export function BackgroundSettings({ onClose }: Props) {
  const { config, updateConfig, resetConfig } = useBackground();
  const [img, setImg] = useState(config.image);
  const [brightness, setBrightness] = useState(config.brightness);
  const [opacity, setOpacity] = useState(config.opacity);
  const [scale, setScale] = useState(config.zoom / 100);    // 1.0 = fit
  const [offset, setOffset] = useState({ x: (config.posX - 50) / 50 * 100, y: (config.posY - 50) / 50 * 100 });
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Convert internal state → BgConfig for live preview
  const applyPreview = useCallback((s: number, o: { x: number; y: number }) => {
    const zoom = Math.round(s * 100);
    const posX = Math.round(50 + (o.x / 100) * 50);
    const posY = Math.round(50 + (o.y / 100) * 50);
    updateConfig({ image: img, brightness, opacity, zoom, posX, posY });
  }, [img, brightness, opacity, updateConfig]);

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
        setScale(1); setOffset({ x: 0, y: 0 });
        updateConfig({ image: dataUrl, zoom: 100, posX: 50, posY: 50, brightness, opacity });
      };
      imgEl.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); };

  const handleSave = () => {
    const zoom = Math.round(scale * 100);
    const posX = Math.round(50 + (offset.x / 100) * 50);
    const posY = Math.round(50 + (offset.y / 100) * 50);
    updateConfig({ image: img, brightness, opacity, zoom, posX, posY });
    onClose();
  };

  const handleRemove = () => { resetConfig(); setImg(null); setScale(1); setOffset({ x: 0, y: 0 }); setBrightness(100); setOpacity(30); };

  // ── Mouse / Touch interaction ──────────────────────────────────

  const dragState = useRef<{ active: boolean; startX: number; startY: number; offX: number; offY: number; pinchDist: number; pinchScale: number }>({
    active: false, startX: 0, startY: 0, offX: 0, offY: 0, pinchDist: 0, pinchScale: 1,
  });

  const clampOffset = useCallback((x: number, y: number, s: number) => {
    // Allow panning up to 1 image dimension beyond the frame in each direction
    const max = 100 * s;
    return {
      x: Math.max(-max, Math.min(max, x)),
      y: Math.max(-max, Math.min(max, y)),
    };
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = { ...dragState.current, active: true, startX: e.clientX, startY: e.clientY, offX: offset.x, offY: offset.y };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragState.current.active) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    const newOff = clampOffset(dragState.current.offX + dx, dragState.current.offY + dy, scale);
    setOffset(newOff);
    applyPreview(scale, newOff);
  };

  const onMouseUp = () => { dragState.current.active = false; };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.max(0.5, Math.min(4, scale + delta));
    setScale(newScale);
    const newOff = clampOffset(offset.x, offset.y, newScale);
    setOffset(newOff);
    applyPreview(newScale, newOff);
  };

  // Touch handlers
  const touchState = useRef<{ pinching: boolean; lastDist: number; lastScale: number; lastX: number; lastY: number; offX: number; offY: number }>({
    pinching: false, lastDist: 0, lastScale: 1, lastX: 0, lastY: 0, offX: 0, offY: 0,
  });

  const getTouchDist = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      dragState.current = { ...dragState.current, active: true, startX: e.touches[0].clientX, startY: e.touches[0].clientY, offX: offset.x, offY: offset.y };
    } else if (e.touches.length === 2) {
      dragState.current.active = false;
      touchState.current = { pinching: true, lastDist: getTouchDist(e.touches), lastScale: scale, lastX: offset.x, lastY: offset.y, offX: offset.x, offY: offset.y };
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    if (touchState.current.pinching && e.touches.length === 2) {
      const dist = getTouchDist(e.touches);
      const newScale = Math.max(0.5, Math.min(4, touchState.current.lastScale * (dist / touchState.current.lastDist)));
      setScale(newScale);
      const newOff = clampOffset(offset.x, offset.y, newScale);
      setOffset(newOff);
      applyPreview(newScale, newOff);
    } else if (dragState.current.active && e.touches.length === 1) {
      const dx = e.touches[0].clientX - dragState.current.startX;
      const dy = e.touches[0].clientY - dragState.current.startY;
      const newOff = clampOffset(dragState.current.offX + dx, dragState.current.offY + dy, scale);
      setOffset(newOff);
      applyPreview(scale, newOff);
    }
  };

  const onTouchEnd = () => { dragState.current.active = false; touchState.current.pinching = false; };

  // ── Render ─────────────────────────────────────────────────────

  const labelCls = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5";

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
          {/* Image upload / Crop area */}
          <div>
            <label className={labelCls}>Crop & Position</label>
            {img ? (
              <div
                ref={cropRef}
                className="relative w-full rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-gray-800 select-none cursor-grab active:cursor-grabbing"
                style={{ aspectRatio: `${window.innerWidth} / ${window.innerHeight}` }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onWheel={onWheel}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              >
                {/* The image — scaled and offset */}
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${img})`,
                    backgroundSize: `${scale * 100}%`,
                    backgroundPosition: `${50 + offset.x / scale}% ${50 + offset.y / scale}%`,
                    backgroundRepeat: 'no-repeat',
                    filter: `brightness(${brightness}%)`,
                    opacity: opacity / 100,
                  }}
                />
                {/* Crop frame outline */}
                <div className="absolute inset-0 border-2 border-purple-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] pointer-events-none" />
                {/* Hint */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-white/70 bg-black/50 px-2 py-1 rounded pointer-events-none">
                  Drag to pan · Scroll/pinch to zoom
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
            {img && (
              <button onClick={handleRemove} className="mt-2 text-xs text-red-600 dark:text-red-400 hover:underline">Remove image</button>
            )}
          </div>

          {/* Brightness */}
          <div>
            <label className={labelCls}>Brightness <span className="text-gray-400 dark:text-gray-600 font-mono">({brightness}%)</span></label>
            <input type="range" min={0} max={200} value={brightness}
                   onChange={e => { const v = Number(e.target.value); setBrightness(v); applyPreview(scale, offset); updateConfig({ brightness: v }); }}
                   className="w-full accent-purple-500" />
          </div>

          {/* Opacity */}
          <div>
            <label className={labelCls}>Opacity <span className="text-gray-400 dark:text-gray-600 font-mono">({opacity}%)</span></label>
            <input type="range" min={0} max={100} value={opacity}
                   onChange={e => { const v = Number(e.target.value); setOpacity(v); applyPreview(scale, offset); updateConfig({ opacity: v }); }}
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
