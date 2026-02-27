import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import { api } from '../../lib/api';
import { MapCanvas } from '../../components/map/MapCanvas';
import { getOrCreateGuestId } from '../../lib/guest';

interface EventMapProps {
  event?: any;
  slug?: string;
}

export function EventMap({ event: initialEvent, slug: propSlug }: EventMapProps) {
  const params = useParams();
  const navigate = useNavigate();
  const slug = propSlug ?? params.slug;
  const [event, setEvent] = useState<any>(initialEvent || null);
  const [selectedBooth, setSelectedBooth] = useState<any>(null);

  // Stable guestId using useMemo to avoid regeneration in StrictMode
  const guestId = useMemo(() => getOrCreateGuestId(), []);

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

  return (
    <div className="w-full h-full relative">
      <MapCanvas
        mapImageUrl={event.mapImageUrl}
        booths={booths}
        readOnly
        onBoothClick={(b: any) => setSelectedBooth(b)}
        selectedBoothId={selectedBooth?.id || null}
        onBackgroundClick={() => setSelectedBooth(null)}
      />
      
      {/* Custom Vendor Drawer */}
      {selectedBooth && (
        <div 
          className="fixed inset-x-0 bottom-0 z-50 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] rounded-t-2xl p-6 transition-transform duration-300 ease-in-out"
          style={{ transform: 'translateY(0)' }}
        >
          {/* Close Handle / Indicator */}
          <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6" />

          <div className="space-y-4 max-w-lg mx-auto">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {selectedBooth.name}
                </h2>
                <p className="text-sm font-medium text-orange-600">
                  {selectedBooth.vendor?.businessName || 'Available Booth'}
                </p>
              </div>
              <button 
                onClick={() => setSelectedBooth(null)}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {selectedBooth.vendor ? (
              <>
                <p className="text-gray-600 text-sm line-clamp-3">
                  {selectedBooth.vendor.description || 'No description available.'}
                </p>

                <button 
                  onClick={() => navigate(`/customer/event/${slug}/order/${selectedBooth.vendor.id}`)}
                  className="w-full bg-black text-white py-3 rounded-xl font-semibold hover:bg-gray-800 transition-colors active:scale-[0.98]"
                >
                  Go To Order Page
                </button>
              </>
            ) : (
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-gray-500 text-sm">This booth is currently available.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
