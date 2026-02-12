import { useRef } from 'react';
import { Rnd } from 'react-rnd';

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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (readOnly) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (readOnly || !dragStartRef.current) return;
    
    const dx = Math.abs(e.clientX - dragStartRef.current.x);
    const dy = Math.abs(e.clientY - dragStartRef.current.y);
    
    // Only treat as click if moved less than 4px (drag threshold)
    if (dx < 4 && dy < 4) {
      onBackgroundClick?.();
    }
    
    dragStartRef.current = null;
  };

  return (
    <div 
      className="relative bg-gray-100 overflow-hidden w-full h-full select-none"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <div
        ref={mapContainerRef}
        className="origin-top-left transition-transform duration-75 ease-out"
        style={{ 
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          width: 'fit-content',
          height: 'fit-content'
        }}
      >
        <div 
          className="relative bg-white shadow-lg border border-slate-200"
          style={{ 
            width: '1000px', // Base width
            height: '800px', // Base height
            backgroundImage: `url(${mapImageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
          onClick={(e) => e.stopPropagation()} 
        >
          {!mapImageUrl && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-gray-50 pointer-events-none">
              No Map Image Set
            </div>
          )}

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
              onMouseDown={(e) => e.stopPropagation()} // Stop bubbling to prevent background click
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
  );
}
