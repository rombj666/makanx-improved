import { useMemo, useState } from 'react';
import { ActiveOrder } from '../../hooks/useCustomerOrders';
import OrderStatusStepper from './OrderStatusStepper';

type Props = {
  order: ActiveOrder;
  boothLabel?: string;
  defaultExpanded?: boolean;
};

export function OrderTrackingCard({ order, boothLabel, defaultExpanded = false }: Props) {
  const [open, setOpen] = useState(defaultExpanded);
  const eta = useMemo(() => Math.max(Number(order.estimatedMinutes ?? 0), 0), [order.estimatedMinutes]);

  const hasItems = Array.isArray(order.items) && order.items.length > 0;

  return (
    <div className="bg-white rounded-3xl shadow-md overflow-hidden border border-gray-100">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left p-4 active:scale-[0.99] transition"
        aria-label={`Toggle order ${order.displayNumber}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-lg font-extrabold text-gray-900">#{order.displayNumber}</div>
            <div className="text-sm text-gray-600">
              {order.vendorName || 'Vendor'}
              {boothLabel ? <span className="text-gray-400"> · </span> : null}
              {boothLabel ? <span className="text-gray-600">{boothLabel}</span> : null}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-semibold text-gray-900">{eta > 0 ? `~${eta} min` : '—'}</div>
            <div className="text-xs text-gray-500">{open ? 'Tap to collapse' : 'Tap to expand'}</div>
          </div>
        </div>
      </button>

      {open ? (
        <div className="px-4 pb-4">
          <div className="mt-1">
            <div className="text-xs font-semibold text-gray-500 mb-2">Status</div>
            <OrderStatusStepper status={order.status} />
          </div>

          {hasItems ? (
            <div className="mt-4">
              <div className="text-xs font-semibold text-gray-500 mb-2">Items</div>
              <div className="space-y-3">
                {order.items!.map((it, idx) => (
                  <div key={idx} className="bg-[#FAF7F0] rounded-2xl p-3">
                    <div className="text-sm font-semibold text-gray-900">
                      {it.quantity}x {it.name || 'Item'}
                    </div>
                    {it.remark && String(it.remark).trim() !== '' ? (
                      <div className="text-sm text-gray-600 mt-1">
                        <span className="text-gray-500">Remark:</span> {String(it.remark)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default OrderTrackingCard;
