import { useMemo } from 'react';
import { useCustomerOrders } from '../../hooks/useCustomerOrders';

export function CustomerSidebar({
  eventSlug,
  open,
  onClose,
}: { eventSlug: string; open: boolean; onClose: () => void }) {
  const { orders } = useCustomerOrders(eventSlug);

  const count = useMemo(() => orders.length, [orders]);

  return (
    <>
      <div
        className={`fixed top-0 left-0 h-full w-[80%] md:w-80 bg-white shadow-xl transition-transform duration-300 z-50 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold">My Orders ({count})</div>
          <button
            aria-label="Close"
            onClick={onClose}
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
                        <span className="text-green-700 font-semibold">READY — Collect now</span>
                      ) : (
                        <span className="text-gray-700">
                          {o.status === 'PREPARING' ? `~${o.estimatedMinutes} min` : o.status}
                        </span>
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
