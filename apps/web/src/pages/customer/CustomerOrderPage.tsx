
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import BoothHeader from '../../components/customer/BoothHeader';
import MenuCard from '../../components/customer/MenuCard';
import CartBar from '../../components/customer/CartBar';
import { useCustomerCart } from '../../hooks/useCustomerCart';
import { toast } from 'react-hot-toast';
import { ProductDetailSheet } from '../../components/customer/ProductDetailSheet';
import { useCustomerOrders } from '../../hooks/useCustomerOrders';
import { computeDisplayEtaMinutesFromQuantity, roundUpToNearest5Minutes } from '../../lib/utils';

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl: string;
  optionGroups?: any[];
  remarksEnabled?: boolean;
}

interface Booth {
  id: string;
  name: string;
  showPrices?: boolean;
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
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

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

  const cart = useCustomerCart({
    eventSlug: String(slug || ''),
    vendorId: String(vendorId || ''),
    vendorName: booth?.vendor?.businessName || booth?.name || '',
    boothName: booth?.name || '',
  });
  const hidePrices = booth?.showPrices === false;
  const prepTimeMinutes = computeDisplayEtaMinutesFromQuantity(cart.totalItems);
  const { orders } = useCustomerOrders(String(slug || ''));
  const activeOrdersForVendor = useMemo(() => {
    return orders
      .filter((o) => o.vendorId === String(vendorId || '') && (o.status === 'PREPARING' || o.status === 'READY'))
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [orders, vendorId]);
  const activeOrder = activeOrdersForVendor[0] || null;
  const mode: 'cart' | 'order' | 'empty' =
    cart.totalItems > 0 ? 'cart' : activeOrder ? 'order' : 'empty';
  const orderEta = activeOrder
    ? roundUpToNearest5Minutes(Math.max(Number(activeOrder.estimatedMinutes ?? 0), 0))
    : 0;

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
        description={null}
        heroImageUrl={null}
        prepTimeMinutes={prepTimeMinutes}
        onBack={() => navigate(`/customer/event/${slug}`)}
      />

      <div className="flex-1 overflow-y-auto p-4 pb-28">
        {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
        {menu.length === 0 ? (
          <p className="text-neutral-600">No menu items.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
            {menu.map((item) => (
              <MenuCard
                key={item.id}
                name={item.name}
                price={item.price}
                image={item.imageUrl}
                onClick={() => setActiveItem(item)}
                className="border-neutral-900/15 shadow-none h-full"
                hidePrice={hidePrices}
              />
            ))}
          </div>
        )}
      </div>

      <CartBar
        totalItems={cart.totalItems}
        totalPrice={cart.total}
        hidePrices={hidePrices}
        topText={
          mode === 'order'
            ? `Order #${activeOrder?.displayNumber || '—'}`
            : `${cart.totalItems} ${cart.totalItems === 1 ? 'item' : 'items'}`
        }
        bottomText={
          mode === 'order'
            ? activeOrder?.status === 'READY'
              ? 'READY — Collect now'
              : activeOrder?.status === 'PREPARING'
                ? `~${orderEta} min`
                : String(activeOrder?.status || '')
            : undefined
        }
        actionLabel={mode === 'cart' ? 'View Cart' : 'Summary'}
        onOpenSummary={() => setSummaryOpen(true)}
        onViewCart={() => {
          if (mode === 'cart') {
            navigate(`/customer/event/${slug}/order/${vendorId}/cart`);
            return;
          }
          setSummaryOpen(true);
        }}
      />

      <ProductDetailSheet
        isOpen={!!activeItem}
        name={activeItem?.name || ''}
        price={Number(activeItem?.price || 0)}
        imageUrl={activeItem?.imageUrl || ''}
        optionGroups={Array.isArray(activeItem?.optionGroups) ? activeItem?.optionGroups : []}
        remarksEnabled={activeItem?.remarksEnabled !== false}
        hidePrice={hidePrices}
        onClose={() => setActiveItem(null)}
        onAdd={({ quantity, remark, selectedOptions }) => {
          if (!activeItem) return;
          cart.addLine({
            menuItemId: activeItem.id,
            name: activeItem.name,
            price: Number(activeItem.price),
            quantity,
            remark,
            imageUrl: activeItem.imageUrl || '',
            selectedOptions,
            remarksEnabled: activeItem?.remarksEnabled !== false,
          });
          toast.success('Added to cart');
        }}
      />

      <SummarySheet
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        title={mode === 'cart' ? 'Cart Summary' : mode === 'order' ? 'Order Summary' : 'Summary'}
      >
        {mode === 'cart' ? (
          <div>
            {cart.lines.length === 0 ? (
              <div className="text-sm text-neutral-600">Your cart is empty.</div>
            ) : (
              <div className="space-y-3">
                {cart.lines.map((l) => (
                  <div key={l.id} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-semibold text-black">
                        {l.quantity}x {l.name}
                      </div>
                      {!hidePrices ? (
                        <div className="text-sm font-semibold text-black">
                          RM{(l.price * l.quantity).toFixed(2)}
                        </div>
                      ) : null}
                    </div>
                    {Array.isArray((l as any).selectedOptions) && (l as any).selectedOptions.length > 0 ? (
                      <div className="mt-1 text-xs text-neutral-600">
                        {(l as any).selectedOptions
                          .map((s: any) => {
                            const title = typeof s?.title === 'string' ? s.title : '';
                            const labels = Array.isArray(s?.choiceLabels) ? s.choiceLabels.filter(Boolean) : [];
                            if (!title || labels.length === 0) return '';
                            return `${title}: ${labels.join(', ')}`;
                          })
                          .filter(Boolean)
                          .join(' • ')}
                      </div>
                    ) : null}
                    {l.remark && String(l.remark).trim() !== '' ? (
                      <div className="mt-1 text-xs text-neutral-600">
                        <span className="text-neutral-500">Remark:</span> {String(l.remark).trim()}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-neutral-100 bg-white p-4">
              <div className="flex items-center justify-between text-sm">
                <div className="text-neutral-600">Items</div>
                <div className="font-semibold text-black">{cart.totalItems}</div>
              </div>
              {!hidePrices ? (
                <div className="flex items-center justify-between text-sm mt-1">
                  <div className="text-neutral-600">Total</div>
                  <div className="font-semibold text-black">RM{cart.total.toFixed(2)}</div>
                </div>
              ) : null}
              <button
                onClick={() => navigate(`/customer/event/${slug}/order/${vendorId}/cart`)}
                disabled={cart.totalItems <= 0}
                className="mt-3 w-full rounded-2xl py-3 text-sm font-semibold shadow-md active:scale-[0.99] transition bg-black text-white disabled:opacity-50"
              >
                Go to Cart
              </button>
            </div>
          </div>
        ) : mode === 'order' && activeOrder ? (
          <div>
            <div className="rounded-2xl border border-neutral-100 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold text-black">Order #{activeOrder.displayNumber}</div>
                <div className="text-xs font-bold text-neutral-600">{String(activeOrder.status || '').toUpperCase()}</div>
              </div>
              {activeOrder.status === 'PREPARING' ? (
                <div className="mt-1 text-sm text-neutral-600">Estimated prep time: ~{orderEta} min</div>
              ) : activeOrder.status === 'READY' ? (
                <div className="mt-1 text-sm text-neutral-600">READY — Collect now</div>
              ) : null}
            </div>

            {Array.isArray(activeOrder.items) && activeOrder.items.length > 0 ? (
              <div className="mt-4 space-y-3">
                {activeOrder.items.map((it, idx) => (
                  <div key={idx} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
                    <div className="text-sm font-semibold text-black">
                      {it.quantity}x {it.name || 'Item'}
                    </div>
                    {it.remark && String(it.remark).trim() !== '' ? (
                      <div className="mt-1 text-xs text-neutral-600">
                        <span className="text-neutral-500">Remark:</span> {String(it.remark).trim()}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-sm text-neutral-600">Summary unavailable.</div>
            )}
          </div>
        ) : (
          <div className="text-sm text-neutral-600">No cart or active order.</div>
        )}
      </SummarySheet>
    </div>
  );
}

function SummarySheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  const sheet = (
    <div className="fixed inset-0 z-50 bg-black/60" onMouseDown={onClose} onTouchStart={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 bg-neutral-50 rounded-t-3xl shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-neutral-200">
          <div className="text-base font-semibold text-black truncate">{title}</div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full border border-neutral-200 text-black bg-white active:scale-95 transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">
          {children}
          <div className="pb-[max(env(safe-area-inset-bottom),12px)]" />
        </div>
      </div>
    </div>
  );
  return createPortal(sheet, document.body);
}
