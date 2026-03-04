import { useEffect, useState } from 'react';
import { useCustomerOrders } from '../../hooks/useCustomerOrders';

export function MobileOrdersSidebar({ eventSlug }: { eventSlug: string }) {
  const { orders } = useCustomerOrders(eventSlug);
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const count = orders.length;

  if (!isMobile) return null;

  return (
    <>
      <div className="fixed bottom-4 left-4 right-4 z-40 md:hidden">
        <button
          onClick={() => setOpen(true)}
          className="w-full bg-white border rounded-xl shadow-xl px-4 py-3 text-left"
          aria-label="Open Order Tracker"
        >
          {orders.length === 0 ? (
            <div className="flex items-center justify-between">
              <div className="font-semibold">No active orders</div>
              <div className="text-xs text-gray-500">(Tap to refresh)</div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="font-semibold">Order #{orders[0].displayNumber}</div>
              <div className="text-sm text-gray-700">
                {orders[0].status === 'READY' ? (
                  <span className="text-green-700 font-semibold">READY — Collect now</span>
                ) : (
                  <span>
                    {orders[0].status === 'PREPARING'
                      ? `Preparing (~${orders[0].estimatedMinutes} min)`
                      : orders[0].status}
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="text-xs text-gray-500 mt-1">Tap to expand</div>
        </button>
      </div>

      <div className={`fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out ${open ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">My Orders ({count})</div>
          <button
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="w-8 h-8 rounded-full border flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto">
          {orders.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No active orders</div>
          ) : (
            <ul className="divide-y">
              {orders.map((o) => (
                <li key={o.orderId} className="p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="font-bold">#{o.displayNumber}</div>
                    <div className="text-xs text-gray-500">
                      {o.status === 'READY' ? (
                        <span className="text-green-700 font-semibold">READY</span>
                      ) : (
                        <span className="text-gray-700">{o.status}</span>
                      )}
                    </div>
                  </div>
                  {o.vendorName ? (
                    <div className="text-xs text-gray-500">Vendor: {o.vendorName}</div>
                  ) : null}

                  {Array.isArray(o.items) && o.items.length > 0 ? (
                    <div className="mt-2">
                      <div className="text-xs font-medium text-gray-600 mb-1">Items:</div>
                      <ul className="text-sm space-y-0.5">
                        {o.items.map((it, idx) => (
                          <li key={idx}>
                            {it.quantity}x {it.name || 'Item'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
