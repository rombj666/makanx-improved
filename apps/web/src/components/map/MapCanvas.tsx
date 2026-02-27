import { useRef, useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';

interface Booth {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  status: string;
  vendor?: {
    businessName: string;
  };
}

interface Viewport {
  scale: number;
  x: number;
  y: number;
}

interface MapCanvasProps {
  mapImageUrl?: string;
  booths: Booth[];
  readOnly?: boolean;
  onBoothUpdate?: (id: string, data: Partial<Booth>) => void;
  onBoothClick?: (booth: Booth) => void;
  selectedBoothId?: string | null;
  onBackgroundClick?: () => void;
  viewport?: Viewport;
  onViewportChange?: (v: Viewport) => void;
  centerRequestKey?: number;
  onFixMap?: () => void;
  myBoothId?: string | null;
}

export function MapCanvas({ 
  mapImageUrl, 
  booths, 
  readOnly = false, 
  onBoothUpdate, 
  onBoothClick,
  selectedBoothId,
  onBackgroundClick,
  viewport = { scale: 1, x: 0, y: 0 },
  onViewportChange,
  centerRequestKey = 0,
  onFixMap,
  myBoothId = null
}: MapCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [imageError, setImageError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  
  // Reset natural size when map URL changes to ensure fitToView triggers on new load
  useEffect(() => {
    setNaturalSize({ width: 0, height: 0 });
  }, [mapImageUrl]);
  
  // Robust fitToView Logic
  const fitToView = useCallback(() => {
    if (!wrapperRef.current || naturalSize.width === 0 || naturalSize.height === 0) return;

    const { clientWidth, clientHeight } = wrapperRef.current;
    
    // Calculate fit scale (95% of container)
    const scaleX = clientWidth / naturalSize.width;
    const scaleY = clientHeight / naturalSize.height;
    const scale = Math.min(scaleX, scaleY) * 0.95;
    
    // Center the map
    const x = (clientWidth - naturalSize.width * scale) / 2;
    const y = (clientHeight - naturalSize.height * scale) / 2;
    
    onViewportChange?.({ scale, x, y });
  }, [naturalSize, onViewportChange]);

  // Interaction State
  const [dragging, setDragging] = useState<{
    mode: 'pan' | 'booth' | 'resize' | null;
    pointerId: number | null;
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
    boothId?: string;
    boothStartX?: number;
    boothStartY?: number;
    // Resize specific
    resizeDir?: string; // nw, ne, sw, se
    startWidth?: number;
    startHeight?: number;
    captureEl?: HTMLElement | null;
  }>({
    mode: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    startTx: 0,
    startTy: 0,
    captureEl: null
  });

  // Fit triggers (natural size changed, re-fit only if not dragging)
  useEffect(() => {
    // Only fit if we have a valid image size and not actively dragging
    if (naturalSize.width > 0 && naturalSize.height > 0 && dragging.mode === null) {
      fitToView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalSize, fitToView]);

  // Center button request always overrides
  useEffect(() => {
    if (centerRequestKey > 0) {
      fitToView();
    }
  }, [centerRequestKey, fitToView]);

  // ResizeObserver for wrapper
  useEffect(() => {
    if (!wrapperRef.current) return;
    
    const resizeObserver = new ResizeObserver(() => {
       // Do not auto-fit while dragging; otherwise fit
       if (dragging.mode === null) {
         fitToView();
       }
    });
    
    resizeObserver.observe(wrapperRef.current);
    return () => resizeObserver.disconnect();
  }, [fitToView, dragging.mode]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setNaturalSize({ width: naturalWidth, height: naturalHeight });
    setImageError(false);
    // fitToView will trigger via useEffect [naturalSize]
  };

  const hasCenteredRef = useRef(false);
  useEffect(() => {
    if (!myBoothId || hasCenteredRef.current) return;
    const b = booths.find(b => b.id === myBoothId);
    if (!b || !wrapperRef.current) return;
    const { clientWidth, clientHeight } = wrapperRef.current;
    const centerX = b.x + b.width / 2;
    const centerY = b.y + b.height / 2;
    const x = clientWidth / 2 - centerX * viewport.scale;
    const y = clientHeight / 2 - centerY * viewport.scale;
    onViewportChange?.({ ...viewport, x, y });
    hasCenteredRef.current = true;
  }, [myBoothId, booths, onViewportChange, viewport]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // A) Pan must work even when readOnly=true (removed readOnly check)
    // Only left click (0) or middle click (1)
    if (e.button !== 0 && e.button !== 1) return;

    const target = e.currentTarget as HTMLElement; // B) Use currentTarget (wrapper) for stability
    
    target.setPointerCapture(e.pointerId);
    
    setDragging({
      mode: 'pan',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTx: viewport.x,
      startTy: viewport.y,
      captureEl: target
    });
    e.preventDefault();
  };

  const handleBoothPointerDown = (e: React.PointerEvent, booth: Booth) => {
    if (readOnly) {
       e.stopPropagation();
       if (selectedBoothId !== booth.id) {
         onBoothClick?.(booth);
       }
       return;
    }

    e.stopPropagation();
    e.preventDefault();

    if (selectedBoothId !== booth.id) {
      onBoothClick?.(booth);
    }

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    setDragging({
      mode: 'booth',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTx: 0, 
      startTy: 0,
      boothId: booth.id,
      boothStartX: booth.x,
      boothStartY: booth.y,
      captureEl: target
    });
  };

  const handleResizePointerDown = (e: React.PointerEvent, dir: string, booth: Booth) => {
    if (readOnly) return;
    e.stopPropagation();
    e.preventDefault();

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    setDragging({
        mode: 'resize',
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startTx: 0,
        startTy: 0,
        boothId: booth.id,
        boothStartX: booth.x,
        boothStartY: booth.y,
        startWidth: booth.width,
        startHeight: booth.height,
        resizeDir: dir,
        captureEl: target
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.mode || dragging.pointerId !== e.pointerId) return;

    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;
    const scale = viewport.scale;

    if (dragging.mode === 'pan') {
      onViewportChange?.({
        ...viewport,
        x: dragging.startTx + dx,
        y: dragging.startTy + dy
      });
    } 
    else if (dragging.mode === 'booth' && dragging.boothId && dragging.boothStartX !== undefined && dragging.boothStartY !== undefined) {
      const scaledDx = dx / scale;
      const scaledDy = dy / scale;

      onBoothUpdate?.(dragging.boothId, {
        x: dragging.boothStartX + scaledDx,
        y: dragging.boothStartY + scaledDy
      });
    }
    else if (dragging.mode === 'resize' && dragging.boothId && dragging.startWidth && dragging.startHeight && dragging.boothStartX !== undefined && dragging.boothStartY !== undefined) {
        const scaledDx = dx / scale;
        const scaledDy = dy / scale;
        
        let newW = dragging.startWidth;
        let newH = dragging.startHeight;
        let newX = dragging.boothStartX;
        let newY = dragging.boothStartY;

        if (dragging.resizeDir?.includes('e')) newW = Math.max(20, dragging.startWidth + scaledDx);
        if (dragging.resizeDir?.includes('s')) newH = Math.max(20, dragging.startHeight + scaledDy);
        if (dragging.resizeDir?.includes('w')) {
            const possibleW = dragging.startWidth - scaledDx;
            if (possibleW >= 20) {
                newW = possibleW;
                newX = dragging.boothStartX + scaledDx;
            }
        }
        if (dragging.resizeDir?.includes('n')) {
            const possibleH = dragging.startHeight - scaledDy;
            if (possibleH >= 20) {
                newH = possibleH;
                newY = dragging.boothStartY + scaledDy;
            }
        }

        onBoothUpdate?.(dragging.boothId, {
            x: newX,
            y: newY,
            width: newW,
            height: newH
        });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragging.mode || dragging.pointerId !== e.pointerId) return;

    const dx = Math.abs(e.clientX - dragging.startX);
    const dy = Math.abs(e.clientY - dragging.startY);
    const isClick = dx < 5 && dy < 5;

    if (dragging.mode === 'pan') {
      if (isClick) {
        onBackgroundClick?.();
      }
    }
    
    // Release capture from stored element
    if (dragging.captureEl && dragging.captureEl.hasPointerCapture(e.pointerId)) {
        dragging.captureEl.releasePointerCapture(e.pointerId);
    }

    setDragging({ mode: null, pointerId: null, startX: 0, startY: 0, startTx: 0, startTy: 0, captureEl: null });
  };

  const mapSrc = mapImageUrl || '';

  return (
    <div 
      ref={wrapperRef}
      className="w-full h-full relative overflow-hidden select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ touchAction: 'none' }} 
    >
      <div
        ref={mapContainerRef}
        className="origin-top-left will-change-transform"
        style={{ 
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          width: 'fit-content',
          height: 'fit-content',
        }}
      >
        <div 
          className="relative bg-white shadow-lg border border-slate-200"
          style={{ 
            width: naturalSize.width > 0 ? naturalSize.width : '100%', 
            height: naturalSize.height > 0 ? naturalSize.height : '100%',
            minWidth: '100px',
            minHeight: '100px'
          }}
        >
          {/* Map Image Layer */}
          {mapSrc && !imageError ? (
            <img 
              key={`${mapSrc}-${retryKey}`}
              src={mapSrc}
              alt="Event Map"
              className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none z-0"
              onError={(e) => {
                console.error('Map image failed to load:', mapSrc, e);
                setImageError(true);
                toast.error('Map image failed to load');
              }}
              onLoad={handleImageLoad}
            />
) : (
  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-50 z-0 pointer-events-none">
    {imageError ? (
      <div className="flex flex-col items-center gap-2 pointer-events-auto">
        <span className="text-red-500 mb-1">Failed to load map image</span>

        <button
          className="flex items-center gap-2 px-3 py-1 bg-white border rounded shadow-sm hover:bg-gray-50 text-sm text-gray-700"
          onPointerDown={(e) => {
            e.stopPropagation();
            setImageError(false);
            setRetryKey((k) => k + 1);
          }}
        >
          <RefreshCw size={14} /> Retry
        </button>

        {onFixMap && (
          <button
            className="flex items-center gap-2 px-3 py-1 bg-orange-50 border border-orange-200 rounded shadow-sm hover:bg-orange-100 text-sm text-orange-700"
            onPointerDown={(e) => {
              e.stopPropagation();
              onFixMap(); // ✅ call prop directly (or keep handleFixMap if you defined it)
            }}
          >
            Set Default Map
          </button>
        )}
      </div>
    ) : (
      <span>No Map Image Set</span>
    )}
  </div>
)}

          {/* Booths Layer - Manual Rendering replacing Rnd */}
          <div className="absolute inset-0 z-10">
            {booths.map(booth => (
              <div
                key={booth.id}
                style={{
                    left: booth.x,
                    top: booth.y,
                    width: booth.width,
                    height: booth.height
                }}
                className={(() => {
                  const isMine = booth.id === myBoothId;
                  return [
                    'absolute rounded-xl flex flex-col items-center justify-center cursor-pointer select-none touch-none',
                    'transition-all duration-300',
                    readOnly ? 'cursor-default' : 'cursor-move',
                    isMine
                      ? 'z-20 scale-105 ring-4 ring-amber-400 shadow-2xl animate-pulse bg-white/70 backdrop-blur-sm'
                      : 'opacity-70 bg-white/70'
                  ].join(' ');
                })()}
                onPointerDown={(e) => handleBoothPointerDown(e, booth)}
              >
                {booth.id === myBoothId && (
                  <div className="absolute inset-0 rounded-xl bg-amber-400/20 blur-xl animate-pulse pointer-events-none" />
                )}
                {booth.id === myBoothId && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-xs px-3 py-1 rounded-full shadow-lg whitespace-nowrap">
                    You are assigned here
                  </div>
                )}
                {booth.id === myBoothId && (
                  <>
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-amber-500" />
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-amber-500" />
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-amber-500" />
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-amber-500" />
                  </>
                )}
                <div className="relative z-0 pointer-events-none flex flex-col items-center justify-center w-full h-full p-1">
                    <span className="font-bold text-xs select-none truncate w-full text-center">
                    {booth.name}
                    </span>
                    {booth.vendor && (
                    <span className="text-[10px] bg-white/80 px-1 rounded truncate max-w-full">
                        {booth.vendor.businessName}
                    </span>
                    )}
                </div>

                {/* Resize Handles (Only when selected and not readOnly) */}
                {!readOnly && selectedBoothId === booth.id && (
                    <>
                        <div 
                            className="absolute -top-1 -left-1 w-3 h-3 bg-white border border-amber-500 cursor-nw-resize z-50"
                            onPointerDown={(e) => handleResizePointerDown(e, 'nw', booth)} 
                        />
                        <div 
                            className="absolute -top-1 -right-1 w-3 h-3 bg-white border border-amber-500 cursor-ne-resize z-50"
                            onPointerDown={(e) => handleResizePointerDown(e, 'ne', booth)}
                        />
                        <div 
                            className="absolute -bottom-1 -left-1 w-3 h-3 bg-white border border-amber-500 cursor-sw-resize z-50"
                            onPointerDown={(e) => handleResizePointerDown(e, 'sw', booth)}
                        />
                        <div 
                            className="absolute -bottom-1 -right-1 w-3 h-3 bg-white border border-amber-500 cursor-se-resize z-50"
                            onPointerDown={(e) => handleResizePointerDown(e, 'se', booth)}
                        />
                    </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
