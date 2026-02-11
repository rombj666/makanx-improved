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
}

export function MapCanvas({ mapImageUrl, booths, readOnly = false, onBoothUpdate, onBoothClick }: MapCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div 
      ref={mapContainerRef}
      className="relative bg-white shadow-lg mx-auto overflow-hidden rounded-lg border border-slate-200"
      style={{ 
        width: '100%', 
        height: '100%',
        minHeight: '600px',
        backgroundImage: `url(${mapImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      {!mapImageUrl && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-gray-50">
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
          onClick={() => onBoothClick?.(booth)}
          bounds="parent"
          className={`
            border-2 flex flex-col items-center justify-center cursor-pointer transition-colors
            ${readOnly ? 'cursor-default' : 'cursor-move hover:z-50'}
            ${booth.status === 'OCCUPIED' 
              ? 'border-red-500 bg-red-100/80 text-red-900' 
              : 'border-green-500 bg-green-100/80 text-green-900'}
          `}
        >
          <span className="font-bold text-xs select-none pointer-events-none truncate px-1">
            {booth.name}
          </span>
          {booth.vendor && (
            <span className="text-[10px] select-none pointer-events-none truncate px-1 opacity-75">
              {booth.vendor.businessName}
            </span>
          )}
        </Rnd>
      ))}
    </div>
  );
}
