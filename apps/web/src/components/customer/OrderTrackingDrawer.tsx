import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useCustomerOrders } from '../../hooks/useCustomerOrders';
import OrderTrackingCard from './OrderTrackingCard';

type Props = {
  eventSlug: string;
  open: boolean;
  onClose: () => void;
};

export function OrderTrackingDrawer({ eventSlug, open, onClose }: Props) {
  const { orders } = useCustomerOrders(eventSlug);
  const [vendorToBooth, setVendorToBooth] = useState<Record<string, string>>({});

  useEffect(() => {
    const run = async () => {
      if (!eventSlug) return;
      try {
        const { data } = await api.get(`/events/${eventSlug}`);
        if (!data?.success) return;
        const booths: any[] = data.data?.booths || [];
        const map: Record<string, string> = {};
        booths.forEach((b) => {
          if (b?.vendor?.id) {
            map[String(b.vendor.id)] = String(b.name || '');
          }
        });
        setVendorToBooth(map);
      } catch {
        setVendorToBooth({});
      }
    };
    run();
  }, [eventSlug]);

  const activeOrders = useMemo(
    () => orders.filter((o) => o.status === 'PREPARING' || o.status === 'READY'),
    [orders]
  );
  const count = activeOrders.length;

  return (
    <div
      className={`fixed top-0 left-0 h-full w-[85%] max-w-sm bg-white shadow-2xl rounded-r-3xl z-50 transition-transform duration-300 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
      aria-hidden={!open}
    >
      <div className="flex items-center justify-between px-4 py-4 border-b">
        <div className="font-extrabold text-gray-900">My Orders ({count})</div>
        <button
          aria-label="Close"
          onClick={onClose}
          className="w-11 h-11 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center active:scale-95 transition"
        >
          ✕
        </button>
      </div>

      <div className="h-[calc(100%-72px)] overflow-y-auto p-4 bg-[#FAF7F0]">
        {activeOrders.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-md p-5 text-sm text-gray-600">
            No active orders
          </div>
        ) : (
          <div className="space-y-4">
            {activeOrders.map((o, idx) => (
              <OrderTrackingCard
                key={o.orderId}
                order={o}
                boothLabel={vendorToBooth[o.vendorId] ? `Booth ${vendorToBooth[o.vendorId]}` : undefined}
                defaultExpanded={count === 1 || idx === 0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default OrderTrackingDrawer;

