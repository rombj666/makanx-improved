import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { api } from '../../lib/api';
import { getOrCreateGuestId } from '../../lib/guest';
import BoothHeader from '../../components/customer/BoothHeader';
import CartItem from '../../components/customer/CartItem';
import { useCustomerCart } from '../../hooks/useCustomerCart';
import { useCustomerOrders } from '../../hooks/useCustomerOrders';
import { computeDisplayNumber } from '../../lib/utils';

import { EmailPromptSheet } from '../../components/customer/EmailPromptSheet';

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
  const [hidePrices, setHidePrices] = useState<boolean>(false);
  const [customerEmail, setCustomerEmail] = useState('');
  const [emailSheetOpen, setEmailSheetOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailDraftTouched, setEmailDraftTouched] = useState(false);

  const vendorTitle = cart.vendorName || 'Your Cart';

  const guestId = useMemo(() => getOrCreateGuestId(), []);
  const emailStorageKey = useMemo(() => {
    if (!eventSlug) return '';
    return `mx_customer_email_${eventSlug}`;
  }, [eventSlug]);

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

  useEffect(() => {
    const run = async () => {
      try {
        if (!eventSlug) return;
        const { data } = await api.get(`/events/${eventSlug}`);
        const booths: any[] = Array.isArray(data?.data?.booths) ? data.data.booths : [];
        let b: any = null;
        if (boothId) {
          b = booths.find((x) => String(x?.id || '') === String(boothId)) || null;
        } else if (vid) {
          b = booths.find((x) => String(x?.vendor?.id || '') === String(vid)) || null;
        }
        setHidePrices(b?.showPrices === false);
      } catch {}
    };
    run();
  }, [eventSlug, boothId, vid]);

  const summaryItems = useMemo(
    () =>
      cart.lines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        imageUrl: l.imageUrl || '',
        remark: (l as any).remarksEnabled === false ? '' : (l.remark || '').trim(),
        selectedOptions: Array.isArray((l as any).selectedOptions) ? (l as any).selectedOptions : [],
      })),
    [cart.lines]
  );

  const activeOrdersForVendor = useMemo(() => {
    return activeOrders
      .filter((o) => o.vendorId === vid)
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [activeOrders, vid]);

  const hasCheckoutBar = cart.lines.length > 0;

  const performCheckout = async (emailOverride?: string) => {
    if (!vid || cart.lines.length === 0) return;
    setIsPlacing(true);
    setError(null);
    try {
      const normalizedEmail = normalizeEmail(typeof emailOverride === 'string' ? emailOverride : customerEmail);
      if (!isValidEmail(normalizedEmail)) {
        const msg = 'Please enter a valid email address';
        setError(msg);
        toast.error(msg);
        return;
      }
      const res = await api.post('/orders', {
        vendorId: vid,
        items: cart.lines.map((l) => ({
          menuItemId: l.menuItemId,
          quantity: l.quantity,
          remark: (l as any).remarksEnabled === false ? '' : (l.remark || '').trim(),
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
        setError('Checkout failed');
        return;
      }

      const { order, estimatedMinutes } = res.data.data;
      const displayNumber = computeDisplayNumber(order);

      if (emailStorageKey && isValidNonEmptyEmail(normalizedEmail)) {
        try {
          localStorage.setItem(emailStorageKey, normalizedEmail);
        } catch {}
      }

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
      setEmailDraft('');
      setEmailDraftTouched(false);
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
          customerEmail: normalizedEmail || undefined,
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

  const requestCheckout = async () => {
    if (isPlacing) return;
    if (!vid || cart.lines.length === 0) return;
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

  return (
    <div className="w-full h-full bg-neutral-50 flex flex-col">
      <BoothHeader
        boothName={vendorTitle}
        boothNumber={cart.boothName || null}
        vendorName={cart.vendorName || null}
        description={null}
        heroImageUrl={null}
        prepTimeMinutes={5}
        onBack={() =>
          boothId
            ? navigate(`/customer/event/${eventSlug}/booth/${boothId}`)
            : navigate(`/customer/event/${eventSlug}/order/${vid}`)
        }
      />

      <div className={`flex-1 overflow-y-auto p-4 ${hasCheckoutBar ? 'pb-32' : 'pb-6'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold text-black">Cart</div>
          <button
            onClick={() => navigate(`/customer/event/${eventSlug}/order/${vid}`)}
            className="text-sm font-semibold text-neutral-700 underline underline-offset-4"
          >
            Continue browsing
          </button>
        </div>

        {error ? <div className="text-red-600 text-sm mb-3">{error}</div> : null}

        {activeOrdersForVendor.length > 0 ? (
          <div className="mb-4">
            <div className="text-sm font-semibold text-black mb-2">Current Orders</div>
            <div className="space-y-3">
              {activeOrdersForVendor.map((ord) => {
                const ordStatus = String(ord.status || '').toUpperCase();
                return (
                  <div key={ord.orderId} className="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden">
                    <div className="p-5">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-black">Order #{ord.displayNumber}</div>
                        <span
                          className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-bold ${
                            ordStatus === 'READY'
                              ? 'bg-neutral-900 text-white'
                              : ordStatus === 'PREPARING'
                                ? 'bg-white text-black border border-neutral-200'
                                : 'bg-neutral-100 text-neutral-800'
                          }`}
                        >
                          {ordStatus || '—'}
                        </span>
                      </div>

                      {Array.isArray(ord.items) && ord.items.length > 0 ? (
                        <div className="mt-4">
                          <div className="text-sm font-semibold text-black">Order Details</div>
                          <div className="mt-3 space-y-3">
                            {ord.items.map((it, idx) => (
                              <div key={idx} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
                                <div className="text-sm font-semibold text-black">
                                  {it.quantity}x {it.name || 'Item'}
                                </div>
                                {it.remark && String(it.remark).trim() !== '' ? (
                                  <div className="mt-1 text-sm text-neutral-600">
                                    <span className="text-neutral-500">Remark:</span> {String(it.remark)}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="text-sm font-semibold text-black mb-2">New Cart</div>

        {cart.lines.length === 0 ? (
          <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm p-5 text-neutral-600">
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
                hidePrices={hidePrices}
              />
            ))}
          </div>
        )}
      </div>

      {cart.lines.length > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <div className="mx-4 mb-4 rounded-3xl shadow-2xl bg-white overflow-hidden">
            <div className="p-4">
              {!hidePrices ? (
                <>
                  <div className="flex justify-between text-sm text-gray-600">
                    <div>Subtotal</div>
                    <div className="font-semibold text-black">RM{cart.subtotal.toFixed(2)}</div>
                  </div>
                  <div className="flex justify-between mt-1 text-base">
                    <div className="font-semibold text-black">Total</div>
                    <div className="font-extrabold text-black">RM{cart.total.toFixed(2)}</div>
                  </div>
                </>
              ) : null}

              <button
                onClick={requestCheckout}
                disabled={cart.lines.length === 0 || isPlacing}
                className="mt-4 w-full bg-black text-white rounded-2xl py-4 text-base font-semibold shadow-xl disabled:opacity-50 active:scale-[0.99] transition"
              >
                {isPlacing ? 'Placing order…' : 'Place New Order'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
    </div>
  );
}

export default CartPage;
