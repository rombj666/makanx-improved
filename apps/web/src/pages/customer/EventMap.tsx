import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { VendorModal } from '../../components/VendorModal';
import { MapCanvas } from '../../components/map/MapCanvas';

interface EventMapProps {
  event?: any;
  slug?: string;
}

export function EventMap({ event: initialEvent, slug: propSlug }: EventMapProps) {
  const params = useParams();
  const slug = propSlug ?? params.slug;
  const [event, setEvent] = useState<any>(initialEvent || null);
  const [selectedBooth, setSelectedBooth] = useState<any>(null);

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
    <div className="w-full h-full">
      <MapCanvas
        mapImageUrl={event.mapImageUrl}
        booths={booths}
        readOnly
        onBoothClick={(b: any) => setSelectedBooth(b)}
        selectedBoothId={selectedBooth?.id || null}
        onBackgroundClick={() => setSelectedBooth(null)}
      />
      {selectedBooth && <VendorModal booth={selectedBooth} onClose={() => setSelectedBooth(null)} />}
    </div>
  );
}
