import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { MapCanvas } from '../../components/map/MapCanvas';
import { OrderTrackingDrawer } from '../../components/customer/OrderTrackingDrawer';
import VendorBottomSheet from '../../components/customer/VendorBottomSheet';
import { useCustomerOrders } from '../../hooks/useCustomerOrders';
import { Receipt } from 'lucide-react';

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
  const [query, setQuery] = useState('');
  const [centerRequestKey, setCenterRequestKey] = useState(0);
  const { orders } = useCustomerOrders(String(slug || ''));

  useEffect(() => {
    const hasBooths =
      initialEvent &&
      Array.isArray((initialEvent as any).booths) &&
      (initialEvent as any).booths.length > 0;
    if (initialEvent && hasBooths) return;
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

  const booths = event?.booths || [];
  const eventName = event?.name || 'Event';

  const activeOrderCount = useMemo(
    () => orders.filter((o) => o.status === 'PREPARING' || o.status === 'READY').length,
    [orders]
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const normalized = booths.slice(0, 5).map((b: any) => ({
      id: b?.id,
      name: b?.name,
      x: b?.x,
      y: b?.y,
      width: b?.width,
      height: b?.height,
    }));
    const invalid = booths.filter((b: any) => {
      const nums = [b?.x, b?.y, b?.width, b?.height].map((v) => Number(v));
      return nums.some((n) => !Number.isFinite(n)) || Number(nums[2]) <= 0 || Number(nums[3]) <= 0;
    });
    if (invalid.length > 0) {
      console.warn('[EventMap] invalid booth geometry', { invalidCount: invalid.length, sample: normalized });
    } else {
      console.debug('[EventMap] booths', { count: booths.length, sample: normalized });
    }
  }, [booths]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const list: any[] = [];
    for (const b of booths) {
      const vendor = b?.vendor;
      if (!vendor) continue;
      const vendorName = String(vendor.businessName || '').toLowerCase();
      const boothName = String(b.name || '').toLowerCase();
      const menu = Array.isArray(vendor.menuItems) ? vendor.menuItems : [];
      const menuMatch = menu.find((m: any) => String(m?.name || '').toLowerCase().includes(q));
      const vendorMatch = vendorName.includes(q) || boothName.includes(q);
      if (vendorMatch || menuMatch) {
        list.push({
          boothId: b.id,
          boothName: b.name,
          vendorId: vendor.id,
          vendorName: vendor.businessName,
          hit: vendorMatch ? 'vendor' : 'item',
          itemName: vendorMatch ? null : menuMatch?.name || null,
        });
      }
    }
    return list.slice(0, 6);
  }, [booths, query]);

  if (!event) return <div className="flex h-screen items-center justify-center">Loading event...</div>;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#FAF7F0]">
      <div className="absolute inset-0 z-0">
        <MapCanvas
          mapImageUrl={event.mapImageUrl}
          booths={booths}
          readOnly
          centerRequestKey={centerRequestKey}
          onBoothClick={(b: any) => {
            setSelectedBooth(b);
            setQuery('');
          }}
          selectedBoothId={selectedBooth?.id || null}
          onBackgroundClick={() => {
            setSelectedBooth(null);
          }}
        />
      </div>

      <div className="fixed top-0 left-0 right-0 z-40 px-4 pt-4 space-y-3 pointer-events-none">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="w-11 h-11 rounded-full bg-white shadow-md flex items-center justify-center active:scale-95 transition pointer-events-auto"
            aria-label="Back"
          >
            ←
          </button>
          <div className="text-sm font-extrabold text-gray-900 pointer-events-none">MakanX</div>
          <button
            onClick={() => {
              setSelectedBooth(null);
              setQuery('');
              setCenterRequestKey((k) => k + 1);
            }}
            className="w-11 h-11 rounded-full bg-white shadow-md flex items-center justify-center active:scale-95 transition pointer-events-auto"
            aria-label="Recenter map"
          >
            ⤾
          </button>
        </div>

        <div className="flex justify-center pointer-events-none">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/90 backdrop-blur-md shadow-md px-4 py-2">
            <div className="text-xs font-semibold text-gray-500">Event</div>
            <div className="text-sm font-semibold text-gray-900">{eventName}</div>
          </div>
        </div>

        <div className="relative pointer-events-auto">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search food or vendor..."
            className="w-full rounded-2xl px-4 py-3 bg-white/95 backdrop-blur-md shadow-xl border border-gray-100 outline-none focus:ring-2 focus:ring-yellow-400"
          />
          {results.length > 0 ? (
            <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
              {results.map((r) => (
                <button
                  key={r.boothId + String(r.itemName || '')}
                  onClick={() => {
                    const booth = booths.find((b: any) => b.id === r.boothId) || null;
                    if (booth) setSelectedBooth(booth);
                    setQuery('');
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-[#FAF7F0] active:bg-[#FAF7F0]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">
                        {r.vendorName}
                      </div>
                      <div className="text-xs text-gray-500">
                        Booth {r.boothName}
                        {r.hit === 'item' && r.itemName ? (
                          <span className="text-gray-300 mx-2">•</span>
                        ) : null}
                        {r.hit === 'item' && r.itemName ? (
                          <span className="text-gray-600">“{r.itemName}”</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-gray-500">→</div>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {!selectedBooth && !query ? (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="bg-white/90 backdrop-blur-md rounded-full px-4 py-2 shadow-md text-xs font-semibold text-gray-700">
            Tap a booth to explore
          </div>
        </div>
      ) : null}

      <button
        onClick={() => setOrdersOpen((v) => !v)}
        className={[
          'fixed left-3 z-50 shadow-xl bg-black text-white rounded-full',
          'px-3 py-2 flex items-center gap-2 active:scale-95 transition',
          selectedBooth ? 'top-24 sm:top-6' : 'top-1/2 -translate-y-1/2',
        ].join(' ')}
        aria-label="Toggle Orders Sidebar"
      >
        <Receipt size={18} />
        <span className="text-sm font-semibold">Orders</span>
        {activeOrderCount > 0 ? (
          <span className="ml-1 bg-white text-black text-xs font-extrabold rounded-full px-2 py-0.5">
            {activeOrderCount}
          </span>
        ) : null}
      </button>

      <OrderTrackingDrawer
        eventSlug={String(slug)}
        open={ordersOpen}
        onClose={() => setOrdersOpen(false)}
      />

      <VendorBottomSheet
        booth={selectedBooth}
        open={!!selectedBooth}
        onClose={() => setSelectedBooth(null)}
        onPlaceOrder={() => {
          if (selectedBooth?.vendor?.id) {
            navigate(`/customer/event/${slug}/order/${selectedBooth.vendor.id}`);
          }
        }}
      />
    </div>
  );
}
