import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { api } from '../../lib/api';
import { getOrCreateGuestId } from '../../lib/guest';
import BoothHeader from '../../components/customer/BoothHeader';
import CartItem from '../../components/customer/CartItem';
import { useCustomerCart } from '../../hooks/useCustomerCart';
import { useCustomerOrders } from '../../hooks/useCustomerOrders';

function computeDisplayNumber(order: any): string {
  const raw =
    order?.boothOrderNumber ??
    order?.displayNumber ??
    order?.orderNumber ??
    order?.sequence ??
    null;
  if (raw !== null && raw !== undefined && `${raw}`.trim() !== '') {
    return String(raw).toUpperCase();
  }
  const id = order?.id || '';
  return id ? String(id).slice(-4).toUpperCase() : '----';
}

export function CartPage() {
  const { slug, vendorId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const eventSlug = String(slug || '');
  const vid = String(vendorId || '');
  const boothId = searchParams.get('boothId') || '';

  const cart = useCustomerCart({
    eventSlug,
    vendorId: vid,
  });
  const { orders: activeOrders, addOrUpdate } = useCustomerOrders(eventSlug);

  const [isPlacing, setIsPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vendorTitle = cart.vendorName || 'Your Cart';

  const summaryItems = useMemo(
    () =>
      cart.lines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        remark: (l.remark || '').trim(),
      })),
    [cart.lines]
  );

  const activeOrder = useMemo(() => {
    const list = activeOrders.filter((o) => o.vendorId === vid);
    if (list.length === 0) return null;
    return list
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  }, [activeOrders, vid]);

  const activeStatus = String(activeOrder?.status || '').toUpperCase();
  const inActiveOrderMode = !!activeOrder;

  const checkout = async () => {
    if (!vid || cart.lines.length === 0) return;
    setIsPlacing(true);
    setError(null);
    try {
      const guestId = getOrCreateGuestId();
      const res = await api.post('/orders', {
        vendorId: vid,
        items: cart.lines.map((l) => ({
          menuItemId: l.menuItemId,
          quantity: l.quantity,
          remark: (l.remark || '').trim(),
        })),
        paymentMode: 'PAY_AT_BOOTH',
        guestId,
      });

      if (!res.data?.success) {
        setError('Checkout failed');
        return;
      }

      const { order, estimatedMinutes } = res.data.data;
      const displayNumber = computeDisplayNumber(order);

      addOrUpdate({
        orderId: order.id,
        vendorId: order.vendorId,
        vendorName: order.vendor?.businessName || cart.vendorName || '',
        status: order.status,
        estimatedMinutes: Math.max(Number(estimatedMinutes ?? 0), 0),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        displayNumber,
        items: summaryItems.map((it) => ({ name: it.name, quantity: it.quantity, remark: it.remark })),
      } as any);

      cart.clear();
      try {
        localStorage.setItem('mx_center_map', '1');
      } catch {}

      const nextUrl =
        `/customer/order-confirmed?orderId=${encodeURIComponent(order.id)}` +
        (eventSlug ? `&eventSlug=${encodeURIComponent(eventSlug)}` : '') +
        (boothId ? `&boothId=${encodeURIComponent(boothId)}` : '');
      navigate(nextUrl, {
        state: {
          orderId: order.id,
          orderNumber: displayNumber,
          eta: estimatedMinutes,
          eventSlug,
          vendorId: vid,
          boothId,
          items: summaryItems,
        },
      });
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Checkout failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsPlacing(false);
    }
  };

  return (
    <div className="w-full h-full bg-[#FAF7F0] flex flex-col">
      <BoothHeader
        boothName={vendorTitle}
        boothNumber={cart.boothName || null}
        vendorName={cart.vendorName || null}
        description={null}
        heroImageUrl={null}
        prepTimeMinutes={null}
        rating={null}
        onBack={() =>
          boothId
            ? navigate(`/customer/event/${eventSlug}/booth/${boothId}`)
            : navigate(`/customer/event/${eventSlug}/order/${vid}`)
        }
      />

      <div className={`flex-1 overflow-y-auto p-4 ${inActiveOrderMode ? 'pb-6' : 'pb-32'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-bold text-gray-900">View Cart</div>
          <button
            onClick={() => navigate(`/customer/event/${eventSlug}/order/${vid}`)}
            className="text-sm font-semibold text-gray-700 underline underline-offset-4"
          >
            Continue browsing
          </button>
        </div>

        {error ? <div className="text-red-600 text-sm mb-3">{error}</div> : null}

        {activeOrder ? (
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-extrabold text-gray-900">Current Order</div>
                <span
                  className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-bold ${
                    activeStatus === 'READY'
                      ? 'bg-green-100 text-green-800'
                      : activeStatus === 'PREPARING'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-200 text-gray-800'
                  }`}
                >
                  {activeStatus || '—'}
                </span>
              </div>
              <div className="mt-1 text-sm text-gray-600">Order #{activeOrder.displayNumber}</div>

              <div className="mt-4">
                <div className="text-sm font-extrabold text-gray-900">Order Details</div>
                {Array.isArray(activeOrder.items) && activeOrder.items.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {activeOrder.items.map((it, idx) => (
                      <div key={idx} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                        <div className="text-sm font-semibold text-gray-900">
                          {it.quantity}x {it.name || 'Item'}
                        </div>
                        {it.remark && String(it.remark).trim() !== '' ? (
                          <div className="mt-1 text-sm text-gray-600">
                            <span className="text-gray-500">Remark:</span> {String(it.remark)}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-gray-600">Details unavailable.</div>
                )}
              </div>
            </div>
          </div>
        ) : cart.lines.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-md p-5 text-gray-600">
            Your cart is empty.
          </div>
        ) : (
          <div className="space-y-4">
            {cart.lines.map((line) => (
              <CartItem
                key={line.id}
                line={line}
                onQuantityChange={(q) => cart.updateQuantity(line.id, q)}
                onRemarkChange={(r) => cart.updateRemark(line.id, r)}
                onRemove={() => cart.removeLine(line.id)}
              />
            ))}
          </div>
        )}
      </div>

      {!activeOrder ? (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <div className="mx-4 mb-4 rounded-3xl shadow-2xl bg-white overflow-hidden">
            <div className="p-4">
              <div className="flex justify-between text-sm text-gray-600">
                <div>Subtotal</div>
                <div className="font-semibold text-gray-900">${cart.subtotal.toFixed(2)}</div>
              </div>
              <div className="flex justify-between mt-1 text-base">
                <div className="font-semibold text-gray-900">Total</div>
                <div className="font-extrabold text-gray-900">${cart.total.toFixed(2)}</div>
              </div>

              <button
                onClick={checkout}
                disabled={cart.lines.length === 0 || isPlacing}
                className="mt-4 w-full bg-black text-white rounded-2xl py-4 text-base font-semibold shadow-xl disabled:opacity-50 active:scale-[0.99] transition"
              >
                {isPlacing ? 'Placing order…' : 'Place Order'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default CartPage;
