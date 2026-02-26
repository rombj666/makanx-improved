import { useState, useEffect } from 'react';
import { MapCanvas } from '../../components/map/MapCanvas';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { api, toAbsoluteUrl } from '../../lib/api';

interface Booth {
  id: string;
  name: string;
  vendorId?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  status: string;
  vendor?: {
    businessName: string;
  };
}

interface EventSummary {
  id: string;
  name?: string;
  mapImageUrl?: string;
}

export function VendorMap() {
  const { user } = useAuth();
  const { isConnected } = useSocket();
  const [booths, setBooths] = useState<Booth[]>([]);
  const [myBoothId, setMyBoothId] = useState<string | null>(null);
  const [mapImageUrl, setMapImageUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVendorMapData = async () => {
      try {
        const { data } = await api.get('/events?status=ACTIVE');
        const events: EventSummary[] = data?.data || [];
        console.log('Active events:', events.map(e => ({ id: e.id, name: e.name })));

        const currentVendorId = user?.vendorProfile?.id || null;
        // Try to find the event where this vendor has an assigned booth
        if (events.length > 0) {
          if (currentVendorId) {
            // Fetch booths for all events concurrently and find match
            const results = await Promise.all(events.map(async (e) => {
              try {
                const r = await api.get(`/booths/event/${e.id}`);
                const list: Booth[] = r?.data?.data || [];
                const myBooth = list.find((b) => b.vendorId === currentVendorId) || null;
                return { event: e, list, myBooth };
              } catch {
                return { event: e, list: [] as Booth[], myBooth: null as Booth | null };
              }
            }));

            const found = results.find(r => r.myBooth);
            if (found) {
              console.log('Vendor Event:', found.event);
              console.log('Vendor Booth Page eventId:', found.event.id);
              console.log('Fetched booths:', found.list);
              console.log('Current vendorProfile.id:', currentVendorId);
              console.log('My booth:', found.myBooth);
              if (found.myBooth && (found.myBooth.x == null || found.myBooth.y == null || found.myBooth.width == null || found.myBooth.height == null)) {
                console.warn('My booth missing position data:', found.myBooth);
              }
              setBooths(found.list);
              setMyBoothId(found.myBooth?.id || null);
              const resolved = toAbsoluteUrl(found.event.mapImageUrl) || '/images/event-map.jpg';
              setMapImageUrl(resolved || '/images/event-map.jpg');
              return;
            }
          }

          // Fallback: use first active event if no assigned booth found
          const fallback = events[0];
          console.warn('No matching booth found across active events. Falling back to first event:', fallback?.id);
          if (fallback) {
            console.log('Vendor Event:', fallback);
            console.log('Vendor Booth Page eventId:', fallback.id);
            const resolved = toAbsoluteUrl(fallback.mapImageUrl) || '/images/event-map.jpg';
            setMapImageUrl(resolved || '/images/event-map.jpg');
            try {
              const boothsRes = await api.get(`/booths/event/${fallback.id}`);
              const list: Booth[] = boothsRes?.data?.data || [];
              setBooths(list);
              console.log('Fetched booths:', list);
              setMyBoothId(null);
            } catch {
              setBooths([]);
              setMyBoothId(null);
            }
          } else {
            setMapImageUrl('/images/event-map.jpg');
            setBooths([]);
            setMyBoothId(null);
          }
        } else {
          console.warn('No ACTIVE events returned from API');
          setMapImageUrl('/images/event-map.jpg');
          setBooths([]);
          setMyBoothId(null);
        }
      } catch (error) {
        console.error('Failed to fetch map data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchVendorMapData();
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your booth location...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Your Booth Location</h1>
          <p className="text-gray-600">
            {isConnected ? (
              <span className="inline-flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                Connected
              </span>
            ) : (
              <span className="inline-flex items-center text-orange-600">
                <span className="w-2 h-2 bg-orange-500 rounded-full mr-2"></span>
                Reconnecting...
              </span>
            )}
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Event Map</h2>
              {myBoothId && (
                <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800">
                  <span className="w-2 h-2 bg-amber-500 rounded-full mr-2"></span>
                  Your Booth
                </div>
              )}
            </div>
            
            <div className="border border-gray-200 rounded-2xl overflow-hidden relative" style={{ height: '600px' }}>
              <MapCanvas
                mapImageUrl={mapImageUrl}
                booths={booths}
                readOnly={true}
                myBoothId={myBoothId}
                onFixMap={() => setMapImageUrl('/images/event-map.jpg')}
                onBoothClick={(booth) => {
                  if (booth.id === myBoothId) {
                    console.log('Clicked on vendor booth:', booth);
                  }
                }}
              />
            </div>

            {myBoothId && (
              <div className="mt-4 p-4 bg-amber-50 rounded-2xl border border-amber-200">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-amber-500 rounded-full mr-3"></div>
                  <div>
                    <p className="font-medium text-amber-900">Your booth is highlighted on the map</p>
                    <p className="text-sm text-amber-700">Customers can easily find your location at the event</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
