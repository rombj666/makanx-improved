import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { MapCanvas } from '../../components/map/MapCanvas';
import { OrderTrackingDrawer } from '../../components/customer/OrderTrackingDrawer';
import { BoothInfo } from '../../components/BoothInfo';

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
  const [ordersOpen, setOrdersOpen] = useState(false);

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
    <div className="relative h-screen w-screen overflow-hidden bg-gray-100">
      <div className="absolute inset-0 z-0">
        <MapCanvas
          mapImageUrl={event.mapImageUrl}
          booths={booths}
          readOnly
          onBoothClick={(b: any) => setSelectedBooth(b)}
          selectedBoothId={selectedBooth?.id || null}
          onBackgroundClick={() => setSelectedBooth(null)}
        />
      </div>

      <button
        onClick={() => setOrdersOpen((v) => !v)}
        className="fixed top-1/2 left-0 -translate-y-1/2 bg-black text-white w-11 h-11 rounded-r-2xl z-50 shadow-xl flex items-center justify-center active:scale-95 transition"
        aria-label="Toggle Orders Sidebar"
      >
        {ordersOpen ? '←' : '→'}
      </button>

      <OrderTrackingDrawer
        eventSlug={String(slug)}
        open={ordersOpen}
        onClose={() => setOrdersOpen(false)}
      />

      {selectedBooth && (
        <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl p-4 z-40">
          <BoothInfo
            booth={selectedBooth}
            onClose={() => setSelectedBooth(null)}
            onPlaceOrder={() => {
              if (selectedBooth?.vendor?.id) {
                navigate(`/customer/event/${slug}/order/${selectedBooth.vendor.id}`);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
