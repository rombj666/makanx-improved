import { useRef, useState } from 'react';
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
  onFixMap
}: MapCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [imageError, setImageError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [lastAction, setLastAction] = useState('');

  // Interaction State
  const [dragging, setDragging] = useState<{
    mode: 'pan' | 'booth' | null;
    pointerId: number | null;
    startX: number;
    startY: number;
    startTx: number; // Viewport X
    startTy: number; // Viewport Y
    boothId?: string;
    boothStartX?: number;
    boothStartY?: number;
  }>({
    mode: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    startTx: 0,
    startTy: 0
  });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    
    // Background Pan Start
    // Only if left click (button 0) or middle click (button 1)
    if (e.button !== 0 && e.button !== 1) return;

    const target = e.target as HTMLElement;
    
    // Safety check: if target is part of a booth (e.g. text span), find the booth container?
    // Actually, booth pointer events are stopped by handleBoothPointerDown.
    // So if we reach here, it SHOULD be background.
    
    setDragging({
      mode: 'pan',
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTx: viewport.x,
      startTy: viewport.y
    });
    setLastAction('PAN START');
    
    // Store capture element to release correctly later
    target.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const handleBoothPointerDown = (e: React.PointerEvent, booth: Booth) => {
    // If readOnly, we still allow selection (click) but NO dragging
    // If readOnly, stopPropagation to prevent pan?
    // Requirement: "Customer/Vendor view (readOnly=true) must still PAN + CLICK booths (select)"
    // If we stopPropagation, background pan won't fire.
    // So for readOnly:
    // - Click booth -> Select (fire onBoothClick)
    // - Drag booth -> Should PAN the map (pass through to background)?
    //   OR should just do nothing?
    //   Usually map apps: dragging a feature in read-only mode pans the map.
    //   So we should NOT stopPropagation if readOnly.
    
    if (readOnly) {
       // We still want to select on click.
       // We can detect click in onClick? Or pointerUp?
       // If we let it bubble, background will start PAN.
       // If user clicks (no drag), background PAN handles click as "Background Click".
       // We need to intercept "Click" on booth.
       
       // Strategy for ReadOnly:
       // 1. Capture pointer locally to detect click vs drag?
       // 2. Or just use onClick for selection and let pointerDown bubble for panning?
       //    If we let pointerDown bubble, MapCanvas starts panning.
       //    If user clicks booth, MapCanvas finishes pan (dx<5) and calls onBackgroundClick.
       //    This would DESELECT the booth!
       //    So we MUST stopPropagation even in readOnly to prevent background click logic.
       
       // BUT if we stopPropagation, we can't pan by dragging the booth.
       // Tradeoff: In readOnly, you must drag empty space to pan. Dragging booth does nothing.
       // This satisfies "Customer view... Can pan map". (doesn't say MUST pan via booth).
       
       e.stopPropagation();
       
       // Just select immediately?
       if (selectedBoothId !== booth.id) {
         onBoothClick?.(booth);
       }
       return;
    }

    e.stopPropagation(); // Stop background pan
    e.preventDefault();

    setLastAction(`BOOTH DOWN: ${booth.name}`);

    // Select booth immediately
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
      boothStartY: booth.y
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
      setLastAction('PANNING');
    } else if (dragging.mode === 'booth' && dragging.boothId && dragging.boothStartX !== undefined && dragging.boothStartY !== undefined) {
      // Apply scale to delta
      const scale = viewport.scale;
      const scaledDx = dx / scale;
      const scaledDy = dy / scale;

      // Update booth position
      onBoothUpdate?.(dragging.boothId, {
        x: dragging.boothStartX + scaledDx,
        y: dragging.boothStartY + scaledDy
      });
      setLastAction('DRAGGING BOOTH');
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragging.mode || dragging.pointerId !== e.pointerId) return;

    const dx = Math.abs(e.clientX - dragging.startX);
    const dy = Math.abs(e.clientY - dragging.startY);
    const isClick = dx < 5 && dy < 5; // 5px threshold

    if (dragging.mode === 'pan') {
      if (isClick) {
        onBackgroundClick?.();
        setLastAction('BACKGROUND CLICK');
      } else {
        setLastAction('PAN END');
      }
    } else {
        setLastAction('BOOTH DROP');
    }
    
    const target = e.target as HTMLElement;
    if (target.hasPointerCapture && target.hasPointerCapture(e.pointerId)) {
        target.releasePointerCapture(e.pointerId);
    }

    setDragging({ mode: null, pointerId: null, startX: 0, startY: 0, startTx: 0, startTy: 0 });
  };

  const mapSrc = mapImageUrl || '';

  return (
    <div 
      className="relative bg-gray-100 overflow-hidden w-full h-full select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      // Also handle leave/cancel to clear state
      onPointerLeave={handlePointerUp} 
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
            width: '1000px', 
            height: '800px', 
          }}
        >
          {/* Debug Overlay */}
          <div className="absolute top-2 left-2 z-50 bg-black/50 text-white text-xs px-2 py-1 rounded pointer-events-none">
            {lastAction || 'Ready'}
          </div>

          {/* Map Image Layer */}
          {mapSrc && !imageError ? (
            <img 
              key={`${mapSrc}-${retryKey}`}
              src={mapSrc}
              alt="Event Map"
              className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none z-0"
              onError={(e) => {
                console.error('Map image failed to load:', mapSrc, e);
                setImageError(true);
                toast.error('Map image failed to load');
              }}
              onLoad={() => setImageError(false)}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-50 z-0 pointer-events-none">
              {imageError ? (
                 <div className="flex flex-col items-center gap-2 pointer-events-auto">
                   <span className="text-red-500 mb-1">Failed to load map image</span>
                   <span className="text-xs text-gray-400 mb-3 max-w-md truncate px-4">{mapSrc}</span>
                   <div className="flex gap-2">
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
                            onFixMap();
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
                disableDragging={true} // We handle dragging manually!
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
                {/* 
                  Wrapper div to capture pointer events for manual drag/select 
                  We put it inside Rnd so it moves with Rnd, but covers the area.
                  POINTER EVENTS: 
                  - If resizing enabled (selected), we need pointer-events-none on this overlay 
                    so resize handles (children of Rnd) can be clicked?
                    Actually Rnd handles are children of Rnd container.
                    This overlay is a child of Rnd container.
                    If this overlay is z-10 and full size, it might block handles if they are below?
                    React-Rnd puts handles as children. 
                    If we want handles to work, this overlay shouldn't block them.
                    But we need this overlay to catch clicks for dragging.
                    
                    Solution: Rnd handles usually have high z-index.
                    We will make this overlay pointer-events-auto ONLY for drag/click.
                    If we are resizing, maybe we don't need this overlay?
                    Actually, if we click this overlay, we start dragging.
                    Resize handles are on the edge.
                */}
                <div 
                  className={`absolute inset-0 z-10 ${selectedBoothId === booth.id && !readOnly ? 'pointer-events-none' : ''}`}
                  onPointerDown={(e) => {
                      // If it's selected and editable, we disabled pointer events so resize handles work.
                      // BUT then we can't drag!
                      // Catch-22.
                      // Better approach: Rnd has `dragHandleClassName`.
                      // We can set dragHandleClassName to a specific class we put on this div.
                      // Then Rnd handles drag.
                      // BUT we implemented manual drag.
                      
                      // If we use manual drag, we don't need Rnd's drag.
                      // We disabled Rnd drag (`disableDragging={true}`).
                      // So we MUST catch events here.
                      
                      // If we are selected, we want resize handles (provided by Rnd) to work.
                      // Rnd handles are absolute positioned on edges.
                      // This div is inset-0.
                      // If handles have higher z-index, they will capture events first.
                      // Let's rely on Rnd default z-index for handles.
                      
                      // Revert pointer-events-none change and rely on z-index.
                      handleBoothPointerDown(e, booth)
                  }}
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
