import { useRef, useState, useEffect, useCallback } from 'react';
import { Rnd } from 'react-rnd';
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
  onFixMap
}: MapCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [imageError, setImageError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  
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

  // Handle Set Default Map button click
  const handleFixMap = () => {
    onFixMap?.();
  };

  // Fit triggers
  useEffect(() => {
    // Only fit if we have a valid image size
    if (naturalSize.width > 0 && naturalSize.height > 0) {
       fitToView();
    }
  }, [naturalSize, centerRequestKey, fitToView]);

  // ResizeObserver for wrapper
  useEffect(() => {
    if (!wrapperRef.current) return;
    
    const resizeObserver = new ResizeObserver(() => {
       // Debounce or just fit? Let's just fit for now, checking if dragging
       // If dragging, maybe don't fit?
       // Requirement: "Do not auto-fit while dragging"
       // We can't easily access dragging state here without ref or prop.
       // But typically resize happens on window resize.
       fitToView();
    });
    
    resizeObserver.observe(wrapperRef.current);
    return () => resizeObserver.disconnect();
  }, [fitToView]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setNaturalSize({ width: naturalWidth, height: naturalHeight });
    setImageError(false);
    // fitToView will trigger via useEffect [naturalSize]
  };

  // Interaction State
  const [dragging, setDragging] = useState<{
    mode: 'pan' | 'booth' | null;
    pointerId: number | null;
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
    boothId?: string;
    boothStartX?: number;
    boothStartY?: number;
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

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.mode || dragging.pointerId !== e.pointerId) return;

    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;

    if (dragging.mode === 'pan') {
      onViewportChange?.({
        ...viewport,
        x: dragging.startTx + dx,
        y: dragging.startTy + dy
      });
    } else if (dragging.mode === 'booth' && dragging.boothId && dragging.boothStartX !== undefined && dragging.boothStartY !== undefined) {
      const scale = viewport.scale;
      const scaledDx = dx / scale;
      const scaledDy = dy / scale;

      onBoothUpdate?.(dragging.boothId, {
        x: dragging.boothStartX + scaledDx,
        y: dragging.boothStartY + scaledDy
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
      className="relative bg-gray-100 overflow-hidden w-full h-full select-none"
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
                          setRetryKey(k => k + 1);
                       }}
                     >
                       <RefreshCw size={14} /> Retry
                     </button>
                     {onFixMap && (
                       <button 
                         className="flex items-center gap-2 px-3 py-1 bg-orange-50 border border-orange-200 rounded shadow-sm hover:bg-orange-100 text-sm text-orange-700"
                         onPointerDown={(e) => {
                            e.stopPropagation();
                            handleFixMap();
                         }}
                       >
                         Set Default Map
                       </button>
                     )}
                   </div>
                 </div>
              ) : (
                <span>No Map Image Set</span>
              )}
            </div>
          )}

          {/* Booths Layer */}
          <div className="absolute inset-0 z-10">
            {booths.map(booth => (
              <Rnd
                key={booth.id}
                size={{ width: booth.width, height: booth.height }}
                position={{ x: booth.x, y: booth.y }}
                disableDragging={true}
                enableResizing={!readOnly && (selectedBoothId === booth.id)}
                onResizeStop={(_, __, ref, ___, position) => {
                  onBoothUpdate?.(booth.id, { 
                    width: parseInt(ref.style.width), 
                    height: parseInt(ref.style.height),
                    ...position 
                  });
                }}
                bounds="parent"
                scale={viewport.scale}
                className={`
                  border-2 flex flex-col items-center justify-center cursor-pointer transition-colors
                  ${readOnly ? 'cursor-default' : 'cursor-move hover:z-50'}
                  ${selectedBoothId === booth.id 
                    ? 'border-orange-500 bg-orange-100/80 z-50 ring-2 ring-orange-300 ring-offset-1' 
                    : booth.status === 'OCCUPIED' || booth.vendor
                      ? 'border-green-500 bg-green-100/80 text-green-900' 
                      : 'border-blue-500 bg-blue-100/80 text-blue-900'}
                `}
              >
                {/* Interaction Overlay */}
                <div 
                  className="absolute inset-0 z-10"
                  onPointerDown={(e) => handleBoothPointerDown(e, booth)}
                />
                
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
              </Rnd>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
