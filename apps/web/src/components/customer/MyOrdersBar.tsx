import { useMemo, useState } from 'react';
import { useCustomerOrders } from '../../hooks/useCustomerOrders';
import { useEtaCountdown } from '../../hooks/useEtaCountdown';

export function MyOrdersBar({ eventSlug }: { eventSlug: string }) {
  const { orders, decrementEta } = useCustomerOrders(eventSlug);
  const [open, setOpen] = useState(false);

  useEtaCountdown(() => {
    decrementEta();
  }, 60000);

  const activeCount = orders.length;

  const summary = useMemo(() => {
    if (orders.length === 0) return 'No active orders';
    const ready = orders.find((o) => o.status === 'READY');
    if (ready) {
      return `READY — Collect now (#${ready.displayNumber})`;
    }
    const latest = orders[0];
    const etaText =
      latest.status === 'PENDING' || latest.status === 'PREPARING'
        ? `~${latest.estimatedMinutes} min`
        : latest.status;
    return `Latest: #${latest.displayNumber} — ${etaText}`;
  }, [orders]);

  return (
    <div className="h-full flex flex-col">
      <div
        className="bg-white border-b px-4 py-3 flex items-center justify-between cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="font-semibold">My Orders ({activeCount})</div>
        <div className="text-sm text-gray-600">{summary}</div>
      </div>
      {open && orders.length > 0 && (
        <div className="bg-white flex-1 overflow-y-auto">
          <ul className="divide-y">
            {orders.map((o) => (
              <li key={o.orderId} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">#{o.displayNumber}</div>
                  <div className="text-xs text-gray-500">{o.vendorName || ''}</div>
                </div>
                <div className="text-sm">
                  {o.status === 'READY' ? (
                    <span className="text-green-700 font-semibold">READY — Collect now</span>
                  ) : (
                    <span className="text-gray-700">
                      {o.status === 'PENDING' || o.status === 'PREPARING'
                        ? `~${o.estimatedMinutes} min`
                        : o.status}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
