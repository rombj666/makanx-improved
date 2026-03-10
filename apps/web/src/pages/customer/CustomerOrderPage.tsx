
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { getOrCreateGuestId } from '../../lib/guest';
import { useCustomerOrders } from '../../hooks/useCustomerOrders';
import BoothHeader from '../../components/customer/BoothHeader';
import MenuCard from '../../components/customer/MenuCard';
import CartBar from '../../components/customer/CartBar';

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
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
  const [, setIsPlacing] = useState(false);
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
    return booth.vendor.menuItems.map((m: any) => ({
      ...m,
      price: Number(m.price),
      imageUrl: m.imageUrl || '',
    }));
  }, [booth]);

  const add = (id: string) => {
    setQuantities((q) => ({ ...q, [id]: (q[id] || 0) + 1 }));
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

  const totalItems = useMemo(() => items.reduce((sum, it) => sum + it.quantity, 0), [items]);

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
      <BoothHeader
        boothName={booth.name}
        boothNumber={booth.name}
        vendorName={booth.vendor?.businessName || null}
        rating={null}
        prepTimeMinutes={null}
      />

      <div className="flex-1 overflow-y-auto p-4 pb-28">
        {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
        {menu.length === 0 ? (
          <p className="text-gray-500">No menu items.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {menu.map((item) => (
              <MenuCard
                key={item.id}
                name={item.name}
                price={item.price}
                image={item.imageUrl}
                description={item.description}
                onAdd={() => add(item.id)}
              />
            ))}
          </div>
        )}
      </div>

      <CartBar
        totalItems={totalItems}
        totalPrice={total}
        onViewCart={placeOrder}
      />
    </div>
  );
}
