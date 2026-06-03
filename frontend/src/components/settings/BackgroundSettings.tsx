import { useState, useEffect, useRef, type DragEvent } from 'react';
import { useBackground, type BgConfig } from '../../contexts/BackgroundContext';

interface Props { onClose: () => void; }

export function BackgroundSettings({ onClose }: Props) {
  const { config, updateConfig, resetConfig } = useBackground();
  const [img, setImg] = useState(config.image);
  const [brightness, setBrightness] = useState(config.brightness);
  const [opacity, setOpacity] = useState(config.opacity);
  const [zoom, setZoom] = useState(config.zoom);
  const [posX, setPosX] = useState(config.posX);
  const [posY, setPosY] = useState(config.posY);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Live preview: apply changes immediately
  const preview = (patch: Partial<BgConfig>) => {
    updateConfig(patch);
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      // Resize large images to save localStorage space
      const img = new Image();
      img.onload = () => {
        const maxW = 1920;
        let w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setImg(dataUrl);
        preview({ image: dataUrl });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); };

  const handleSave = () => {
    updateConfig({ image: img, brightness, opacity, zoom, posX, posY });
    onClose();
  };

  const handleRemove = () => {
    resetConfig();
    setImg(null);
    setBrightness(100); setOpacity(30); setZoom(120); setPosX(50); setPosY(50);
  };

  const labelCls = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5";

  // Generate preview style
  const previewStyle: React.CSSProperties = img ? {
    backgroundImage: `url(${img})`,
    backgroundSize: zoom <= 100 ? 'contain' : `${zoom}%`,
    backgroundPosition: `${posX}% ${posY}%`,
    backgroundRepeat: 'no-repeat',
    filter: `brightness(${brightness}%)`,
    opacity: opacity / 100,
  } : {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 md:rounded-xl
                      w-full max-w-lg md:mx-4 shadow-2xl h-full md:max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-200">Chat Background</h3>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Image upload / preview */}
          <div>
            <label className={labelCls}>Image</label>
            {img ? (
              <div className="space-y-2">
                <div className="relative h-40 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                  <div className="absolute inset-0" style={previewStyle} />
                </div>
                <button onClick={handleRemove} className="text-xs text-red-600 dark:text-red-400 hover:underline">Remove image</button>
              </div>
            ) : (
              <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
                   onClick={() => fileRef.current?.click()}
                   className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
                     ${dragOver ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/10' : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'}`}>
                <input ref={fileRef} type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} className="hidden" />
                <svg className="w-8 h-8 mx-auto mb-2 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <p className="text-sm text-gray-600 dark:text-gray-400">Drop an image or <span className="text-purple-600 dark:text-purple-400">browse</span></p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">JPEG/PNG, max 1920px (stored locally)</p>
              </div>
            )}
          </div>

          {/* Zoom */}
          <div>
            <label className={labelCls}>Zoom <span className="text-gray-400 dark:text-gray-600 font-mono">({zoom}%)</span></label>
            <input type="range" min={100} max={300} value={zoom}
                   onChange={e => { const v = Number(e.target.value); setZoom(v); preview({ zoom: v }); }}
                   className="w-full accent-purple-500" />
            <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-600"><span>Fit</span><span>Zoomed</span></div>
          </div>

          {/* Position X */}
          <div>
            <label className={labelCls}>Horizontal Position <span className="text-gray-400 dark:text-gray-600 font-mono">({posX}%)</span></label>
            <input type="range" min={0} max={100} value={posX}
                   onChange={e => { const v = Number(e.target.value); setPosX(v); preview({ posX: v }); }}
                   className="w-full accent-purple-500" />
            <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-600"><span>Left</span><span>Center</span><span>Right</span></div>
          </div>

          {/* Position Y */}
          <div>
            <label className={labelCls}>Vertical Position <span className="text-gray-400 dark:text-gray-600 font-mono">({posY}%)</span></label>
            <input type="range" min={0} max={100} value={posY}
                   onChange={e => { const v = Number(e.target.value); setPosY(v); preview({ posY: v }); }}
                   className="w-full accent-purple-500" />
            <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-600"><span>Top</span><span>Center</span><span>Bottom</span></div>
          </div>

          {/* Brightness */}
          <div>
            <label className={labelCls}>Brightness <span className="text-gray-400 dark:text-gray-600 font-mono">({brightness}%)</span></label>
            <input type="range" min={0} max={200} value={brightness}
                   onChange={e => { const v = Number(e.target.value); setBrightness(v); preview({ brightness: v }); }}
                   className="w-full accent-purple-500" />
            <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-600"><span>Dark</span><span>Normal</span><span>Bright</span></div>
          </div>

          {/* Opacity */}
          <div>
            <label className={labelCls}>Opacity <span className="text-gray-400 dark:text-gray-600 font-mono">({opacity}%)</span></label>
            <input type="range" min={0} max={100} value={opacity}
                   onChange={e => { const v = Number(e.target.value); setOpacity(v); preview({ opacity: v }); }}
                   className="w-full accent-purple-500" />
            <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-600"><span>Transparent</span><span>Visible</span></div>
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
