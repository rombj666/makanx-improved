
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { getOrCreateGuestId } from '../../lib/guest';
import { useCustomerOrders } from '../../hooks/useCustomerOrders';

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
}

interface Booth {
  id: string;
  name: string;
  vendor?: {
    id: string;
    businessName: string;
    description?: string;
    menuItems?: MenuItem[];
  };
}

export function CustomerOrderPage() {
  const { slug, vendorId } = useParams();
  const navigate = useNavigate();
  const [booth, setBooth] = useState<Booth | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isPlacing, setIsPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addOrUpdate } = useCustomerOrders(slug || '');

  useEffect(() => {
    const run = async () => {
      if (!slug || !vendorId) return;
      try {
        const { data } = await api.get(`/events/${slug}`);
        if (data.success) {
          const event = data.data;
          const found = (event.booths || []).find((b: any) => b.vendor?.id === vendorId) || null;
          setBooth(found);
        }
      } catch (e: any) {
        setError('Failed to load vendor menu');
      }
    };
    run();
  }, [slug, vendorId]);

  const menu: MenuItem[] = useMemo(() => {
    if (!booth?.vendor?.menuItems) return [];
    return booth.vendor.menuItems.map((m: any) => ({ ...m, price: Number(m.price) }));
  }, [booth]);

  const add = (id: string) => {
    setQuantities((q) => ({ ...q, [id]: (q[id] || 0) + 1 }));
  };
  const sub = (id: string) => {
    setQuantities((q) => {
      const n = Math.max(0, (q[id] || 0) - 1);
      const next = { ...q, [id]: n };
      if (n === 0) delete next[id];
      return next;
    });
  };

  const items = useMemo(
    () => Object.entries(quantities).filter(([, qty]) => qty > 0).map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
    [quantities]
  );

  const total = useMemo(() => {
    return items.reduce((sum, it) => {
      const m = menu.find((mi) => mi.id === it.menuItemId);
      return sum + (m ? m.price * it.quantity : 0);
    }, 0);
  }, [items, menu]);

  const placeOrder = async () => {
    if (!vendorId || items.length === 0) return;
    setIsPlacing(true);
    setError(null);
    try {
      const guestId = getOrCreateGuestId();

      const res = await api.post('/orders', {
        vendorId,
        items,
        paymentMode: 'PAY_AT_BOOTH',
        guestId,
      });
      if (res.data?.success) {
        const { order, estimatedMinutes } = res.data.data;
        const raw =
          order?.boothOrderNumber ??
          order?.displayNumber ??
          order?.orderNumber ??
          order?.sequence ??
          null;
        const displayNumber =
          raw !== null && raw !== undefined && `${raw}`.trim() !== ''
            ? String(raw).toUpperCase()
            : String(order.id || '').slice(-4).toUpperCase();
        addOrUpdate({
          orderId: order.id,
          vendorId: order.vendorId,
          vendorName: booth?.vendor?.businessName || '',
          status: order.status,
          estimatedMinutes: Math.max(Number(estimatedMinutes ?? 0), 0),
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          displayNumber,
        });
        try { localStorage.setItem('mx_center_map', '1'); } catch {}
        navigate('/customer/order-confirmed', {
          state: {
            orderId: order.id,
            orderNumber: displayNumber,
            eta: estimatedMinutes,
            eventSlug: slug,
          },
        });
      } else {
        setError('Order failed');
      } 
    } catch (e: any) {
      setError(e.response?.data?.error || 'Order failed');
    } finally {
      setIsPlacing(false);
    }
  };

  if (!booth) {
    return (
      <div className="w-full h-full bg-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Loading...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white flex flex-col">
      <div className="p-6 border-b">
        <h1 className="text-2xl font-bold">{booth.vendor?.businessName || booth.name}</h1>
        <p className="text-sm text-gray-500">Booth {booth.name}</p>
        {booth.vendor?.description && (
          <p className="text-gray-600 mt-1">{booth.vendor.description}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {error && <div className="text-red-600 text-sm">{error}</div>}
        {menu.length === 0 ? (
          <p className="text-gray-500">No menu items.</p>
        ) : (
          menu.map((item) => (
            <div key={item.id} className="flex items-center justify-between border rounded-lg p-4">
              <div>
                <div className="font-medium">{item.name}</div>
                <div className="text-sm text-gray-500">${item.price.toFixed(2)}</div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => sub(item.id)}
                  className="w-9 h-9 rounded-full border text-lg leading-none"
                >
                  -
                </button>
                <div className="w-8 text-center">{quantities[item.id] || 0}</div>
                <button
                  onClick={() => add(item.id)}
                  className="w-9 h-9 rounded-full border text-lg leading-none"
                >
                  +
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-6 border-t hidden md:block">
        <div className="flex justify-between mb-4">
          <span className="font-semibold">Total</span>
          <span className="font-bold">${total.toFixed(2)}</span>
        </div>
        <button
          onClick={placeOrder}
          disabled={items.length === 0 || isPlacing}
          className="w-full bg-black text-white py-3 rounded-xl disabled:opacity-50"
        >
          {isPlacing ? 'Placing...' : 'Place Order'}
        </button>
      </div>
      <div className="fixed bottom-4 left-4 right-4 z-50 md:hidden">
        <div className="flex justify-between mb-2">
          <span className="font-semibold">Total</span>
          <span className="font-bold">${total.toFixed(2)}</span>
        </div>
        <button
          onClick={placeOrder}
          disabled={items.length === 0 || isPlacing}
          className="w-full bg-black text-white py-4 rounded-xl text-lg font-semibold shadow-xl disabled:opacity-50 active:scale-95 transition"
        >
          {isPlacing ? 'Placing...' : 'Place Order'}
        </button>
      </div>
    </div>
  );
}
