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
  offset = { x: 0, y: 0 }
}: MapCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number, y: number } | null>(null);
  const [imageError, setImageError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (readOnly || !dragStartRef.current) return;
    
    const dx = Math.abs(e.clientX - dragStartRef.current.x);
    const dy = Math.abs(e.clientY - dragStartRef.current.y);
    
    // Only treat as click if moved less than 4px (drag threshold)
    if (dx < 4 && dy < 4) {
      onBackgroundClick?.();
    }
    
    dragStartRef.current = null;
  };

  const mapSrc = mapImageUrl || '';

  return (
    <div 
      className="relative bg-gray-100 overflow-hidden w-full h-full select-none"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      style={{ touchAction: 'none' }} // Important for pointer events
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
            width: '1000px', // Base width
            height: '800px', // Base height
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
                 <>
                   <span className="text-red-500 mb-2">Failed to load map image</span>
                   <span className="text-xs text-gray-400 mb-4 max-w-md truncate px-4">{mapSrc}</span>
                   <button 
                     onClick={() => {
                        // We need pointer events enabled for this button, but parent has pointer-events-none?
                        // Actually parent is just a div. The fallback div has pointer-events-none.
                        // We need to enable pointer events for the button.
                     }}
                     className="pointer-events-auto flex items-center gap-2 px-3 py-1 bg-white border rounded shadow-sm hover:bg-gray-50 text-sm text-gray-700"
                     onPointerDown={(e) => {
                        e.stopPropagation();
                        setImageError(false);
                        setRetryKey(k => k + 1);
                     }}
                   >
                     <RefreshCw size={14} /> Retry
                   </button>
                 </>
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
                disableDragging={readOnly}
                enableResizing={!readOnly}
                onDragStop={(_, d) => onBoothUpdate?.(booth.id, { x: d.x, y: d.y })}
                onResizeStop={(_, __, ref, ___, position) => {
                  onBoothUpdate?.(booth.id, { 
                    width: parseInt(ref.style.width), 
                    height: parseInt(ref.style.height),
                    ...position 
                  });
                }}
                onPointerDown={(e: React.PointerEvent) => e.stopPropagation()} // Stop bubbling to prevent background click/pan
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onBoothClick?.(booth);
                }}
                bounds="parent"
                scale={scale} // Important for Rnd to calculate drag correctly when scaled
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
