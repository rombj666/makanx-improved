import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { VendorModal } from '../../components/VendorModal';
import { cn } from '../../lib/utils';

interface EventMapProps {
  event?: any;
}

export function EventMap({ event: initialEvent }: EventMapProps) {
  const { slug } = useParams();
  const [event, setEvent] = useState<any>(initialEvent || null);
  const [selectedBooth, setSelectedBooth] = useState<any>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (initialEvent) {
      return;
    }
    const fetchEvent = async () => {
      try {
        const { data } = await api.get(`/events/${slug}`);
        if (data.success) {
          setEvent(data.data);
        }
      } catch (error) {
        console.error(error);
      }
    };
    if (slug) {
      fetchEvent();
    }
  }, [slug, initialEvent]);

  if (!event) return <div className="flex h-screen items-center justify-center">Loading event...</div>;

  const booths = event.booths || [];
  const filteredBooths = booths.filter((b: any) => 
    b.name.toLowerCase().includes(filter.toLowerCase()) || 
    (b.vendor?.businessName || '').toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-100 overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r flex flex-col z-20 shadow-lg">
        <div className="p-4 border-b">
          <h1 className="font-bold text-lg truncate">{event.name}</h1>
          <p className="text-xs text-gray-500">{event.location}</p>
          <input
            type="text"
            placeholder="Search booths or food..."
            className="w-full mt-4 px-3 py-2 border rounded text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {filteredBooths.map((booth: any) => (
            <div 
              key={booth.id}
              onClick={() => setSelectedBooth(booth)}
              className={cn(
                "p-3 rounded cursor-pointer transition-colors border",
                selectedBooth?.id === booth.id 
                  ? "bg-blue-50 border-blue-500" 
                  : "bg-white hover:bg-gray-50 border-gray-100"
              )}
            >
              <div className="flex justify-between items-center">
                <span className="font-bold text-sm">{booth.name}</span>
                <span className={cn("text-xs px-2 py-0.5 rounded-full", booth.vendor ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600")}>
                  {booth.vendor ? 'Occupied' : 'Available'}
                </span>
              </div>
              {booth.vendor && (
                <p className="text-sm text-gray-600 mt-1 truncate">{booth.vendor.businessName}</p>
              )}
            </div>
          ))}
          {filteredBooths.length === 0 && (
            <p className="text-center text-sm text-gray-500 mt-4">No results found.</p>
          )}
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative overflow-auto bg-gray-200 flex items-center justify-center p-8">
        <div 
          className="relative bg-white shadow-2xl transition-transform"
          style={{ 
            width: '800px', 
            height: '600px',
            backgroundImage: `url(${event.mapImageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          {!event.mapImageUrl && (
             <div className="absolute inset-0 flex items-center justify-center text-gray-400">
               Map Image Not Uploaded
             </div>
          )}

          {booths.map((booth: any) => (
            <div
              key={booth.id}
              onClick={() => setSelectedBooth(booth)}
              style={{
                position: 'absolute',
                left: booth.x,
                top: booth.y,
                width: booth.width,
                height: booth.height,
              }}
              className={cn(
                "border-2 flex items-center justify-center cursor-pointer transition-all shadow-sm hover:shadow-md hover:scale-105",
                selectedBooth?.id === booth.id 
                  ? "border-blue-600 bg-blue-500/30 z-10 scale-105" 
                  : booth.vendor 
                    ? "border-green-500 bg-green-500/20" 
                    : "border-gray-400 bg-gray-200/50"
              )}
            >
              <span className="font-bold text-xs bg-white/80 px-1 rounded shadow-sm backdrop-blur-sm pointer-events-none select-none">
                {booth.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {selectedBooth && (
        <VendorModal booth={selectedBooth} onClose={() => setSelectedBooth(null)} />
      )}
    </div>
  );
}
