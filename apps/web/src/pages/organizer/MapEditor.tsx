import { useState, useEffect, useRef } from 'react';
import { Rnd } from 'react-rnd';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { toast } from 'react-hot-toast';
import { useParams } from 'react-router-dom';

interface Booth {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  status: string;
}

interface Event {
  id: string;
  name: string;
  mapImageUrl?: string;
}

export function MapEditor() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<Event | null>(null);
  const [booths, setBooths] = useState<Booth[]>([]);
  const [mapUrl, setMapUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchEventData();
  }, [eventId]);

  const fetchEventData = async () => {
    try {
      // In a real app, we'd have a specific endpoint for event by ID or similar
      // Assuming we can get event details and booths. 
      // For now, let's fetch all events and find ours (hacky but works for proto)
      // Better: GET /events/:id endpoint (we only have by slug public or list organizer)
      // Let's assume we implement GET /events/:id or reuse the public one if authorized
      
      // Fetching booths
      const boothsRes = await api.get(`/booths/event/${eventId}`);
      if (boothsRes.data.success) {
        setBooths(boothsRes.data.data);
      }

      // Hack: fetch event list to find ours for map url
      const eventsRes = await api.get('/events');
      if (eventsRes.data.success) {
        const found = eventsRes.data.data.find((e: any) => e.id === eventId);
        if (found) {
          setEvent(found);
          setMapUrl(found.mapImageUrl || '');
        }
      }
    } catch (error) {
      toast.error('Failed to load map data');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.post('/booths/layout', {
        eventId,
        mapImageUrl: mapUrl,
        booths: booths.map(b => ({
          id: b.id,
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height
        }))
      });
      toast.success('Layout saved successfully');
    } catch (error) {
      toast.error('Failed to save layout');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddBooth = async () => {
    const name = prompt('Booth Name (e.g., A1):');
    if (!name) return;

    try {
      const { data } = await api.post('/booths', {
        eventId,
        name,
        x: 10,
        y: 10,
        width: 100,
        height: 60
      });
      if (data.success) {
        setBooths([...booths, data.data]);
      }
    } catch (error) {
      toast.error('Failed to create booth');
    }
  };

  const updateBoothPosition = (id: string, d: any) => {
    setBooths(prev => prev.map(b => 
      b.id === id ? { ...b, x: d.x, y: d.y } : b
    ));
  };

  const updateBoothSize = (id: string, ref: any, position: any) => {
    setBooths(prev => prev.map(b => 
      b.id === id ? { 
        ...b, 
        width: parseInt(ref.style.width), 
        height: parseInt(ref.style.height),
        ...position 
      } : b
    ));
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      <div className="bg-white border-b p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <h1 className="font-bold text-lg">Map Editor: {event?.name}</h1>
          <Input 
            placeholder="Map Image URL" 
            value={mapUrl} 
            onChange={(e) => setMapUrl(e.target.value)}
            className="max-w-md"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleAddBooth}>Add Booth</Button>
          <Button onClick={handleSave} isLoading={isSaving}>Save Layout</Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-100 p-8">
        <div 
          ref={mapContainerRef}
          className="relative bg-white shadow-lg mx-auto"
          style={{ 
            width: '800px', 
            height: '600px',
            backgroundImage: `url(${mapUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          {!mapUrl && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400">
              No Map Image Set
            </div>
          )}

          {booths.map(booth => (
            <Rnd
              key={booth.id}
              size={{ width: booth.width, height: booth.height }}
              position={{ x: booth.x, y: booth.y }}
              onDragStop={(_, d) => updateBoothPosition(booth.id, d)}
              onResizeStop={(_, __, ref, ___, position) => {
                updateBoothSize(booth.id, ref, position);
              }}
              bounds="parent"
              className="border-2 border-blue-500 bg-blue-100/50 flex items-center justify-center cursor-move hover:z-50"
            >
              <span className="font-bold text-xs select-none pointer-events-none">
                {booth.name}
              </span>
            </Rnd>
          ))}
        </div>
      </div>
    </div>
  );
}
