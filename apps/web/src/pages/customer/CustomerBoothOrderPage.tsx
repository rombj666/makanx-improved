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
import { computeDisplayEtaMinutesFromQuantity, roundUpToNearest5Minutes, computeDisplayNumber } from '../../lib/utils';
import { EmailPromptSheet } from '../../components/customer/EmailPromptSheet';
import { getOrCreateGuestId } from '../../lib/guest';
import { Minus, Plus, Trash2 } from 'lucide-react';

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
    menuItems?: MenuItem[];
  };
}

export function CustomerBoothOrderPage() {
  const { slug, boothId } = useParams();
  const navigate = useNavigate();
  const [booth, setBooth] = useState<Booth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Checkout state
  const [isPlacing, setIsPlacing] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');
  const [emailSheetOpen, setEmailSheetOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailDraftTouched, setEmailDraftTouched] = useState(false);

  const guestId = useMemo(() => getOrCreateGuestId(), []);
  const emailStorageKey = useMemo(() => {
    if (!slug) return '';
    return `mx_customer_email_${slug}`;
  }, [slug]);

  const normalizeEmail = (email: string) => email.trim();
  const isValidEmail = (email: string) =>
    email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isValidNonEmptyEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  useEffect(() => {
    if (!emailStorageKey) return;
    try {
      const saved = normalizeEmail(localStorage.getItem(emailStorageKey) || '');
      if (isValidNonEmptyEmail(saved)) setCustomerEmail(saved);
    } catch {}
  }, [emailStorageKey]);

  const handleBack = () => navigate(`/customer/event/${slug}`);

  useEffect(() => {
    const run = async () => {
      if (!slug || !boothId) return;
      try {
        const { data } = await api.get(`/events/${slug}`);
        if (data.success) {
          const event = data.data;
          const found = (event.booths || []).find((b: any) => b.id === boothId) || null;
          setBooth(found);
          if (found && !found.vendor?.id) {
            setError('This booth is not available for ordering.');
          } else {
            setError(null);
          }
        }
      } catch (e: any) {
        setError('Failed to load booth menu');
      }
    };
    run();
  }, [boothId, slug]);

  const vendorId = booth?.vendor?.id || '';
  const { orders } = useCustomerOrders(String(slug || ''));

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
    vendorId,
    vendorName: booth?.vendor?.businessName || booth?.name || '',
    boothName: booth?.name || '',
  });

  const { addOrUpdate } = useCustomerOrders(String(slug || ''));

  const performCheckout = async (emailOverride?: string) => {
    if (!vendorId || cart.lines.length === 0) return;
    setIsPlacing(true);
    try {
      const normalizedEmail = normalizeEmail(typeof emailOverride === 'string' ? emailOverride : customerEmail);
      if (!isValidEmail(normalizedEmail)) {
        toast.error('Please enter a valid email address');
        return;
      }
      const res = await api.post('/orders', {
        vendorId,
        items: cart.lines.map((l) => ({
          menuItemId: l.menuItemId,
          quantity: l.quantity,
          remark: l.remarksEnabled === false ? '' : (l.remark || '').trim(),
          selectedOptions: Array.isArray((l as any).selectedOptions)
            ? (l as any).selectedOptions.map((s: any) => ({
                groupId: String(s?.groupId || ''),
                choiceIds: Array.isArray(s?.choiceIds) ? s.choiceIds.map(String).filter(Boolean) : [],
              }))
            : [],
        })),
        paymentMode: 'PAY_AT_BOOTH',
        guestId,
        customerEmail: normalizedEmail || undefined,
      });

      if (!res.data?.success) {
        toast.error('Checkout failed');
        return;
      }

      const { order, estimatedMinutes } = res.data.data;
      const displayNumber = computeDisplayNumber(order);

      if (emailStorageKey && isValidNonEmptyEmail(normalizedEmail)) {
        try {
          localStorage.setItem(emailStorageKey, normalizedEmail);
        } catch {}
      }

      const summaryItems = cart.lines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        imageUrl: l.imageUrl || '',
        remark: l.remarksEnabled === false ? '' : (l.remark || '').trim(),
        selectedOptions: Array.isArray((l as any).selectedOptions) ? (l as any).selectedOptions : [],
      }));

      addOrUpdate({
        orderId: order.id,
        vendorId: order.vendorId,
        vendorName: order.vendor?.businessName || cart.vendorName || '',
        status: order.status,
        estimatedMinutes: Math.max(Number(estimatedMinutes ?? 0), 0),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        displayNumber,
        items: summaryItems.map((it) => ({
          name: it.name,
          quantity: it.quantity,
          imageUrl: it.imageUrl,
          remark: it.remark,
          selectedOptions: it.selectedOptions,
        })),
      } as any);

      cart.clear();
      setSummaryOpen(false);
      setEmailDraft('');
      setEmailDraftTouched(false);
      try {
        localStorage.setItem('mx_center_map', '1');
      } catch {}

      const nextUrl =
        `/customer/order-confirmed?orderId=${encodeURIComponent(order.id)}` +
        (slug ? `&eventSlug=${encodeURIComponent(slug)}` : '') +
        (boothId ? `&boothId=${encodeURIComponent(boothId)}` : '');
      navigate(nextUrl, {
        state: {
          orderId: order.id,
          orderNumber: displayNumber,
          eta: estimatedMinutes,
          eventSlug: slug,
          vendorId,
          boothId,
          customerEmail: normalizedEmail || undefined,
          items: summaryItems,
          newOrder: true, // Flag for inline countdown
        },
      });
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Checkout failed');
    } finally {
      setIsPlacing(false);
    }
  };

  const requestCheckout = async () => {
    if (isPlacing) return;
    if (!vendorId || cart.totalItems <= 0) return;
    const normalized = normalizeEmail(customerEmail);
    if (normalized === '') {
      let saved = '';
      if (emailStorageKey) {
        try {
          saved = normalizeEmail(localStorage.getItem(emailStorageKey) || '');
        } catch {}
      }
      if (isValidNonEmptyEmail(saved)) {
        setCustomerEmail(saved);
        await performCheckout(saved);
        return;
      }
      setEmailDraft('');
      setEmailDraftTouched(false);
      setEmailSheetOpen(true);
      return;
    }
    await performCheckout(normalized);
  };
   const hidePrices = booth?.showPrices === false;
   const prepTimeMinutes = computeDisplayEtaMinutesFromQuantity(cart.totalItems);
  const activeOrdersForVendor = useMemo(() => {
    return orders
      .filter((o) => o.vendorId === vendorId && (o.status === 'PREPARING' || o.status === 'READY'))
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [orders, vendorId]);
  const selectedOrder = useMemo(() => {
    if (!selectedOrderId) return activeOrdersForVendor[0] || null;
    return activeOrdersForVendor.find((o) => String(o.orderId) === String(selectedOrderId)) || activeOrdersForVendor[0] || null;
  }, [activeOrdersForVendor, selectedOrderId]);

  useEffect(() => {
    if (activeOrdersForVendor.length === 0) return;
    const exists = selectedOrderId
      ? activeOrdersForVendor.some((o) => String(o.orderId) === String(selectedOrderId))
      : false;
    if (!exists) setSelectedOrderId(String(activeOrdersForVendor[0].orderId));
  }, [activeOrdersForVendor, selectedOrderId]);

  const mode: 'cart' | 'order' | 'empty' =
    cart.totalItems > 0 ? 'cart' : selectedOrder ? 'order' : 'empty';
  const orderEta = selectedOrder
    ? roundUpToNearest5Minutes(Math.max(Number(selectedOrder.estimatedMinutes ?? 0), 0))
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

  const [servingOrder, setServingOrder] = useState<string | null>(null);

  useEffect(() => {
    if (!vendorId) return;
    const fetchServing = async () => {
      try {
        const { data } = await api.get(`/orders/vendor/${vendorId}/serving`);
        if (data.success) setServingOrder(data.data.displayNumber);
      } catch {}
    };
    fetchServing();
    if (socket) {
      socket.on('vendor_serving_updated', (data: any) => {
        if (data.vendorId === vendorId) setServingOrder(data.displayNumber);
      });
    }
    return () => {
      if (socket) socket.off('vendor_serving_updated');
    };
  }, [vendorId, socket]);

  return (
    <div className="w-full h-full bg-white flex flex-col">
      <BoothHeader
        boothName={booth.name}
        boothNumber={null}
        vendorName={null}
        description={null}
        heroImageUrl={null}
        prepTimeMinutes={prepTimeMinutes}
        onBack={handleBack}
        showBackButton={false}
        variant="minimal"
      />

      <div className="flex-1 overflow-y-auto p-4 pb-28">
        {error ? (
          <div className="bg-white rounded-2xl border border-neutral-900/15 p-5 text-neutral-700">
            {error}
          </div>
        ) : menu.length === 0 ? (
          <p className="text-neutral-600">No menu items.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
            {menu.map((item) => (
              <MenuCard
                key={item.id}
                name={item.name}
                price={item.price}
                image={item.imageUrl}
                isAvailable={item.isAvailable}
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
        topNode={
          mode === 'order' ? (
            <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1">
              <div
                className="shrink-0 text-xs font-semibold text-black underline underline-offset-4"
              >
                Order #{selectedOrder?.displayNumber}
              </div>
            </div>
          ) : undefined
        }
        topText={
          mode === 'order'
            ? `Order #${selectedOrder?.displayNumber || '—'}`
            : `${cart.totalItems} ${cart.totalItems === 1 ? 'item' : 'items'}`
        }
        bottomText={
          mode === 'order'
            ? selectedOrder?.status === 'READY'
              ? 'READY — Collect now'
              : selectedOrder?.status === 'PREPARING'
                ? servingOrder 
                  ? `Now serving #${servingOrder}` 
                  : `Preparing your order`
                : String(selectedOrder?.status || '')
            : undefined
        }
        actionLabel={mode === 'cart' ? 'Proceed to Check Out' : 'Progress'}
        onViewCart={() => {
          if (mode === 'cart') {
            setSummaryOpen(true);
            return;
          }
          if (!selectedOrder?.orderId) {
            toast.success('No active order yet.');
            return;
          }
          const nextUrl =
            `/customer/order-confirmed?orderId=${encodeURIComponent(String(selectedOrder.orderId))}` +
            (slug ? `&eventSlug=${encodeURIComponent(String(slug))}` : '') +
            (boothId ? `&boothId=${encodeURIComponent(String(boothId))}` : '');
          navigate(nextUrl);
        }}
      />

      <EmailPromptSheet
        open={emailSheetOpen}
        emailDraft={emailDraft}
        emailTouched={emailDraftTouched}
        isEmailValid={isValidEmail(normalizeEmail(emailDraft))}
        onEmailChange={(v) => setEmailDraft(v)}
        onEmailBlur={() => setEmailDraftTouched(true)}
        onClose={() => setEmailSheetOpen(false)}
        onContinueWithEmail={async () => {
          const normalized = normalizeEmail(emailDraft);
          setEmailDraftTouched(true);
          if (!isValidEmail(normalized) || normalized === '') {
            toast.error('Please enter a valid email address');
            return;
          }
          setCustomerEmail(normalized);
          setEmailSheetOpen(false);
          await performCheckout(normalized);
        }}
        onSkip={async () => {
          setEmailSheetOpen(false);
          await performCheckout('');
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
        title={mode === 'cart' ? 'Order Summary' : mode === 'order' ? 'Current Order' : 'Summary'}
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
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-black">
                          {l.name}
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
                        {!hidePrices ? (
                          <div className="mt-2 text-sm font-semibold text-black">
                            RM{(l.price * l.quantity).toFixed(2)}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="flex items-center gap-2 bg-neutral-100 rounded-xl p-1">
                          <button
                            onClick={() => cart.updateQuantity(l.id, l.quantity - 1)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white shadow-sm active:scale-90 transition"
                          >
                            {l.quantity === 1 ? <Trash2 size={14} className="text-red-500" /> : <Minus size={14} />}
                          </button>
                          <span className="w-6 text-center text-sm font-bold tabular-nums">
                            {l.quantity}
                          </span>
                          <button
                            onClick={() => cart.updateQuantity(l.id, l.quantity + 1)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white shadow-sm active:scale-90 transition"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
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
                onClick={requestCheckout}
                disabled={cart.totalItems <= 0 || isPlacing}
                className="mt-3 w-full rounded-2xl py-3 text-sm font-semibold shadow-md active:scale-[0.99] transition bg-black text-white disabled:opacity-50"
              >
                {isPlacing ? 'Checking Out...' : 'Check Out'}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-neutral-600">No items in cart.</div>
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
