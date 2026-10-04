import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { guestApi } from '../../lib/guest';

export function TrackOrderPage() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);

  const [error, setError] = useState('');

  useEffect(() => {
    setOrder(null);
    setError('');
    let active = true;
    const load = () => guestApi.get(`/orders/${orderId}`).then(({ data }) => {
      if (active) { setOrder(data.data); setError(''); }
    }).catch(() => {
      if (active) setError('This order cannot be accessed with this browser credential. For orders placed before the security update, please contact the store to verify ownership.');
    });
    load();
    const timer = window.setInterval(load, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [orderId]);

  if (error) return <div className="p-10 text-center" role="alert">{error}</div>;
  if (!order) return <div className="p-10 text-center">Loading order...</div>;
  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-3xl border bg-white p-6 text-center shadow-sm">
        <div className="text-sm uppercase tracking-wide text-neutral-500">Order number</div>
        <div className="mt-2 text-6xl font-black">#{order.eventOrderNumber}</div>
        <div className={`mt-6 rounded-2xl p-4 text-lg font-bold ${order.status === 'READY' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>
          {order.status === 'READY' ? 'Ready for collection' : 'Preparing your order'}
        </div>
        <button
          onClick={() => navigate(order.vendor?.slug ? `/v/${order.vendor.slug}` : '/')}
          className="mt-6 h-11 w-full rounded-xl border font-semibold"
        >
          Back to menu
        </button>
      </div>
    </main>
  );
}
