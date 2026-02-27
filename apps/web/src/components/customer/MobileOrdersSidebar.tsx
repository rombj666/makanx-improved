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

  const Arrow = open ? '◀' : '▶';

  if (!isMobile) return null;

  return (
    <>
      <button
        aria-label="Toggle Orders"
        onClick={() => setOpen(v => !v)}
        className="fixed top-1/2 -translate-y-1/2 left-2 z-50 w-10 h-10 rounded-full bg-white border shadow flex items-center justify-center"
        style={{ touchAction: 'manipulation' }}
      >
        <span className="text-lg leading-none">{Arrow}</span>
      </button>

      <div
        className={`fixed top-0 left-0 h-full z-40 w-[80%] max-w-[420px] bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ willChange: 'transform' }}
      >
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

        <div className="h-[calc(100%-56px)] overflow-y-auto">
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
