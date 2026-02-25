import { useState, useEffect } from 'react';
import { MapCanvas } from '../../components/map/MapCanvas';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';

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

export function VendorMap() {
  const { user } = useAuth();
  const { isConnected } = useSocket();
  const [booths, setBooths] = useState<Booth[]>([]);
  const [myBoothId, setMyBoothId] = useState<string | null>(null);
  const [mapImageUrl, setMapImageUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch vendor's booth information and event map data
    const fetchVendorMapData = async () => {
      try {
        // This would typically be an API call to get the vendor's booth and event map
        // For now, we'll use mock data to demonstrate the structure
        const mockBooths: Booth[] = [
          {
            id: 'booth-1',
            name: 'Booth 1',
            x: 100,
            y: 100,
            width: 80,
            height: 60,
            status: 'occupied',
            vendor: {
              businessName: 'Test Vendor'
            }
          },
          {
            id: 'booth-2',
            name: 'Booth 2',
            x: 200,
            y: 150,
            width: 80,
            height: 60,
            status: 'available'
          }
        ];

        // Simulate finding the vendor's booth
        // For now, we'll just use the first booth as a placeholder
        // In a real implementation, this would be based on the vendor's assigned booth
        setBooths(mockBooths);
        setMyBoothId(mockBooths[0]?.id || null);
        setMapImageUrl('/images/event-map.jpg'); // This would come from the event data
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
            
            <div className="border border-gray-200 rounded-2xl overflow-hidden" style={{ height: '600px' }}>
              <MapCanvas
                mapImageUrl={mapImageUrl}
                booths={booths}
                readOnly={true}
                myBoothId={myBoothId}
                onBoothClick={(booth) => {
                  if (booth.id === myBoothId) {
                    // Could navigate to booth details or show more info
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