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

interface MapCanvasProps {
  mapImageUrl?: string;
  booths: Booth[];
  readOnly?: boolean;
  onBoothUpdate?: (id: string, data: Partial<Booth>) => void;
  onBoothClick?: (booth: Booth) => void;
  selectedBoothId?: string | null;
  onBackgroundClick?: () => void;
  scale?: number;
  offset?: { x: number, y: number };
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
  scale = 1,
  offset = { x: 0, y: 0 },
  onFixMap
}: MapCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number, y: number } | null>(null);
  const [imageError, setImageError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Booth interaction state
  const isDraggingBoothRef = useRef(false);
  const isPointerDownOnBoothRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    
    // Background pointer down - start pan tracking
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (readOnly || !dragStartRef.current) return;
    
    const dx = Math.abs(e.clientX - dragStartRef.current.x);
    const dy = Math.abs(e.clientY - dragStartRef.current.y);
    
    // Only treat as background click if moved less than 4px (drag threshold)
    // AND we didn't just finish dragging a booth
    if (dx < 4 && dy < 4 && !isDraggingBoothRef.current) {
      onBackgroundClick?.();
    }
    
    dragStartRef.current = null;
    isDraggingBoothRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const mapSrc = mapImageUrl || '';

  return (
    <div 
      className="relative bg-gray-100 overflow-hidden w-full h-full select-none"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      style={{ touchAction: 'none' }} 
    >
      <div
        ref={mapContainerRef}
        className="origin-top-left transition-transform duration-75 ease-out"
        style={{ 
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          width: 'fit-content',
          height: 'fit-content',
          minWidth: '100%',
          minHeight: '100%'
        }}
      >
        <div 
          className="relative bg-white shadow-lg border border-slate-200"
          style={{ 
            width: '1000px', 
            height: '800px', 
          }}
          onPointerDown={(e) => e.stopPropagation()} 
        >
          {/* Map Image Layer (Z-Index 0) */}
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

          {/* Booths Layer (Z-Index 10) */}
          <div className="absolute inset-0 z-10">
            {booths.map(booth => (
              <Rnd
                key={booth.id}
                size={{ width: booth.width, height: booth.height }}
                position={{ x: booth.x, y: booth.y }}
                disableDragging={readOnly || (selectedBoothId !== booth.id)}
                enableResizing={!readOnly && (selectedBoothId === booth.id)}
                onDragStart={() => {
                  isDraggingBoothRef.current = true;
                }}
                onDragStop={(_, d) => {
                  // Small delay to prevent click firing immediately after drag
                  setTimeout(() => { isDraggingBoothRef.current = false; }, 50);
                  onBoothUpdate?.(booth.id, { x: d.x, y: d.y });
                }}
                onResizeStop={(_, __, ref, ___, position) => {
                  onBoothUpdate?.(booth.id, { 
                    width: parseInt(ref.style.width), 
                    height: parseInt(ref.style.height),
                    ...position 
                  });
                }}
                onPointerDown={(e: React.PointerEvent) => {
                   e.stopPropagation(); // Stop background pan start
                   isPointerDownOnBoothRef.current = true;
                   // Select immediately on down so drag works
                   if (selectedBoothId !== booth.id) {
                     onBoothClick?.(booth);
                   }
                }}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  // If we were dragging, don't re-trigger select logic (though harmless here)
                  // Main goal is to stop propagation so background doesn't deselect
                  if (!isDraggingBoothRef.current) {
                    onBoothClick?.(booth);
                  }
                }}
                bounds="parent"
                scale={scale}
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
                <span className="font-bold text-xs select-none pointer-events-none truncate px-1 max-w-full">
                  {booth.name}
                </span>
                {booth.vendor && (
                  <span className="text-[10px] select-none pointer-events-none truncate px-1 opacity-75 max-w-full">
                    {booth.vendor.businessName}
                  </span>
                )}
              </Rnd>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
