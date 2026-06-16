import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';

export function TrackOrderPage() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);

  useEffect(() => {
    const load = () => api.get(`/orders/${orderId}`).then(({ data }) => setOrder(data.data)).catch(() => undefined);
    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [orderId]);

  if (!order) return <div className="p-10 text-center">Loading order...</div>;
  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-3xl border bg-white p-6 text-center shadow-sm">
        <div className="text-sm uppercase tracking-wide text-neutral-500">Order number</div>
        <div className="mt-2 text-6xl font-black">#{order.displayNumber}</div>
        <div className={`mt-6 rounded-2xl p-4 text-lg font-bold ${order.status === 'READY' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>
          {order.status === 'READY' ? 'Ready for collection' : 'Preparing your order'}
        </div>
        <button
          onClick={() => navigate(order.vendor?.slug ? `/v/${order.vendor.slug}` : `/order/${order.vendorId}`)}
          className="mt-6 h-11 w-full rounded-xl border font-semibold"
        >
          Back to menu
        </button>
      </div>
    </main>
  );
}
