import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Info } from 'lucide-react';
import { api } from '../../lib/api';
import { getOrCreateGuestId } from '../../lib/guest';
import { getExistingPushSubscription, subscribeToPush } from '../../lib/push';
import { useSocket } from '../../context/SocketContext';
import OrderStatusStepper from '../../components/customer/OrderStatusStepper';

interface OrderState {
  orderId?: string;
  orderNumber?: string;
  eta?: number;
  eventSlug?: string;
  vendorId?: string;
  boothId?: string;
  status?: string;
  customerEmail?: string;
  items?: { name: string; quantity: number; imageUrl?: string; remark?: string; selectedOptions?: any[] }[];
  newOrder?: boolean;
}

export function OrderConfirmationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { socket, isConnected } = useSocket();
  const orderFromState = (location.state || null) as OrderState | null;

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const orderIdFromQuery = searchParams.get('orderId') || undefined;
  const eventSlugFromQuery = searchParams.get('eventSlug') || undefined;
  const boothIdFromQuery = searchParams.get('boothId') || undefined;

  const [resolvedOrder, setResolvedOrder] = useState<OrderState | null>(orderFromState);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(orderFromState?.status || null);

  useEffect(() => {
    if (orderFromState) {
      setResolvedOrder((prev) => ({
        ...(prev || {}),
        ...(orderFromState || {}),
        boothId: orderFromState.boothId || boothIdFromQuery,
      }));
      if (orderFromState?.status) setLiveStatus(orderFromState.status);
      setLoadError(null);
      return;
    }
    if (!orderIdFromQuery) return;

    const run = async () => {
      try {
        const { data } = await api.get(`/orders/${orderIdFromQuery}`);
        const found = data?.data;
        if (!found) {
          setLoadError('Order not found.');
          setResolvedOrder(null);
          return;
        }
        const raw =
          found?.boothOrderNumber ??
          found?.queueNumber ??
          found?.displayNumber ??
          found?.orderNumber ??
          found?.sequence ??
          null;
        const orderNumber =
          raw !== null && raw !== undefined && `${raw}`.trim() !== ''
            ? String(raw).toUpperCase()
            : String(found?.id || '').slice(-4).toUpperCase();
        const items = Array.isArray(found?.items)
          ? found.items.map((it: any) => ({
              name: it?.menuItem?.name || '',
              quantity: Number(it?.quantity ?? 0),
              imageUrl: it?.menuItem?.imageUrl || '',
              remark: it?.remark || '',
              selectedOptions: Array.isArray(it?.selectedOptions) ? it.selectedOptions : [],
            }))
          : [];
        let boothId: string | undefined = boothIdFromQuery;
        const vendorId = String(found?.vendorId || '');
        const status = String(found?.status || '');
        const effectiveSlug = eventSlugFromQuery || '';
        if (!boothId && effectiveSlug && vendorId) {
          try {
            const ev = await api.get(`/events/${effectiveSlug}`);
            const booths: any[] = ev.data?.data?.booths || [];
            const booth = booths.find((b) => String(b?.vendor?.id || '') === vendorId) || null;
            boothId = booth?.id ? String(booth.id) : undefined;
          } catch {}
        }
        setResolvedOrder({
          orderId: String(found.id),
          orderNumber,
          eta: Math.max(Number(found?.estimatedMinutes ?? 5), 0),
          eventSlug: effectiveSlug,
          vendorId,
          boothId,
          status,
          customerEmail: typeof found?.customerEmail === 'string' ? found.customerEmail : undefined,
          items,
        });
        if (status) setLiveStatus(status);
        setLoadError(null);
      } catch (err: any) {
        setLoadError(err?.response?.data?.error || err?.message || 'Failed to load order.');
        setResolvedOrder(null);
      }
    };
    run();
  }, [orderFromState, orderIdFromQuery, eventSlugFromQuery, boothIdFromQuery]);

  const order = resolvedOrder;
  const orderId = order?.orderId || orderIdFromQuery;
  const orderNumber = order?.orderNumber || (orderId ? orderId.slice(-4).toUpperCase() : 'Unknown');
  const items = useMemo(() => (Array.isArray(order?.items) ? order!.items! : []), [order]);
  const eventSlug = order?.eventSlug || eventSlugFromQuery || '';
  const vendorId = order?.vendorId || '';
  const boothId = order?.boothId || boothIdFromQuery || '';
  const status = (liveStatus || order?.status || 'PREPARING').toUpperCase();

  const [pushUiState, setPushUiState] = useState<
    'checking' | 'available' | 'enabled' | 'blocked' | 'not_supported'
  >('checking');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [notifSheetOpen, setNotifSheetOpen] = useState(false);
  const [notifDismissed, setNotifDismissed] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<null | (() => void)>(null);
  const currentPathRef = useRef('');

  useEffect(() => {
    const run = async () => {
      if (typeof window === 'undefined') return;
      const supported =
        'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
      if (!supported) {
        setPushUiState('not_supported');
        return;
      }
      if (Notification.permission === 'denied') {
        setPushUiState('blocked');
        return;
      }
      if (Notification.permission === 'granted') {
        const sub = await getExistingPushSubscription();
        setPushUiState(sub ? 'enabled' : 'available');
        return;
      }
      setPushUiState('available');
    };
    run();
  }, []);

  const hasActiveOrder = status === 'PREPARING' || status === 'READY';
  const shouldLeaveGuard =
    hasActiveOrder && pushUiState !== 'enabled' && pushUiState !== 'checking';
  const canEnableNotifications = pushUiState === 'available';

  const enableNotification = async () => {
    try {
      if (pushBusy) return;
      setPushBusy(true);
      setPushError(null);
      const guestId = getOrCreateGuestId();
      const result = await subscribeToPush(guestId);

      if (result.status === 'enabled') {
        setPushUiState('enabled');
      } else if (result.status === 'blocked') {
        setPushUiState('blocked');
        setPushError('Browser notifications are blocked');
      } else if (result.status === 'not_supported') {
        setPushUiState('not_supported');
        setPushError('Browser does not support website notifications');
      } else if (result.status === 'dismissed') {
        setPushUiState('available');
        setPushError('Notification permission was dismissed');
      } else {
        setPushUiState('available');
        setPushError(result.error || 'Failed to enable notifications.');
      }
    } catch (err: any) {
      console.error(err);
      setPushError(err?.message || 'Failed to enable notifications.');
    }
    setPushBusy(false);
  };

  useEffect(() => {
    if (!orderId) return;
    try {
      const key = `mx_notif_dismissed_${orderId}`;
      setNotifDismissed(sessionStorage.getItem(key) === '1');
    } catch {}
  }, [orderId]);

  useEffect(() => {
    currentPathRef.current = `${location.pathname}${location.search}${location.hash || ''}`;
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!hasActiveOrder) return;
    if (pushUiState !== 'available') return;
    if (notifDismissed) return;
    setNotifSheetOpen(true);
  }, [hasActiveOrder, notifDismissed, pushUiState]);

  useEffect(() => {
    if (pushUiState !== 'enabled') return;
    setNotifSheetOpen(false);
    setPendingLeave(null);
    setPushError(null);
  }, [pushUiState]);

  const requestLeave = (action: () => void) => {
    if (!shouldLeaveGuard) {
      action();
      return;
    }
    setPendingLeave(() => action);
    setNotifSheetOpen(true);
  };

  const continueWithoutNotifications = () => {
    setNotifSheetOpen(false);
    const action = pendingLeave;
    setPendingLeave(null);
    if (action) {
      action();
      return;
    }
    if (orderId) {
      try {
        const key = `mx_notif_dismissed_${orderId}`;
        sessionStorage.setItem(key, '1');
      } catch {}
    }
    setNotifDismissed(true);
  };

  useEffect(() => {
    if (!shouldLeaveGuard) return;
    if (typeof window === 'undefined') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [shouldLeaveGuard]);

  useEffect(() => {
    if (!shouldLeaveGuard) return;
    if (typeof window === 'undefined') return;
    const onPop = () => {
      const attempted = `${window.location.pathname}${window.location.search}${window.location.hash || ''}`;
      const current = currentPathRef.current || attempted;
      if (attempted === current) return;
      window.history.pushState(null, '', current);
      setPendingLeave(() => () => navigate(attempted, { replace: true }));
      setNotifSheetOpen(true);
    };
    window.history.pushState(null, '', currentPathRef.current || window.location.href);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [navigate, shouldLeaveGuard]);

  useEffect(() => {
    if (order || orderIdFromQuery) return;
    navigate('/', { replace: true });
  }, [navigate, order, orderIdFromQuery]);

  useEffect(() => {
    if (!socket) return;
    if (!orderId) return;

    const onUpdate = (updated: any) => {
      if (String(updated?.id || '') !== String(orderId)) return;
      if (updated?.status) setLiveStatus(String(updated.status));
      setResolvedOrder((prev) => ({
        ...(prev || {}),
        orderId: String(updated?.id || prev?.orderId || ''),
        vendorId: String(updated?.vendorId || prev?.vendorId || ''),
        status: String(updated?.status || prev?.status || ''),
      }));
    };

    socket.on('order_updated', onUpdate);
    return () => {
      socket.off('order_updated', onUpdate);
    };
  }, [orderId, socket]);

  useEffect(() => {
    if (!orderId) return;
    if (isConnected) return;
    if (!eventSlug) return;
    if (status === 'COMPLETED') return;
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/orders/${orderId}`);
        const found = data?.data;
        if (!found?.status) return;
        setLiveStatus(String(found.status));
        setResolvedOrder((prev) => ({
          ...(prev || {}),
          vendorId: String(found?.vendorId || prev?.vendorId || ''),
          status: String(found?.status || prev?.status || ''),
        }));
      } catch {}
    }, 15000);
    return () => clearInterval(interval);
  }, [eventSlug, isConnected, orderId, status]);

  if (!order && orderIdFromQuery) {
    return (
      <div className="w-full h-full bg-neutral-50 flex items-center justify-center">
        <div className="text-sm text-neutral-600">{loadError || 'Loading order…'}</div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="w-full h-full bg-neutral-50 flex items-center justify-center">
        <div className="text-sm text-neutral-600">Returning to home…</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-neutral-50 flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto p-4 pb-10">
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-neutral-100">
            <div className="p-5">
              <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Order Confirmed</div>
              <div className="text-2xl font-semibold text-black mt-2">You’re all set</div>

              <div className="mt-5 bg-neutral-50 rounded-3xl p-5 text-center border border-neutral-100">
                <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Your Number</div>
                <div className="text-5xl font-semibold tracking-tight text-black mt-2">#{orderNumber}</div>
              </div>

              <div
                className={`mt-5 rounded-3xl p-6 shadow-xl border ${
                  status === 'READY' || status === 'COMPLETED'
                    ? 'bg-black border-black text-white'
                    : 'bg-white border-neutral-200 text-black'
                }`}
              >
                {status === 'READY' || status === 'COMPLETED' ? (
                  <>
                    <div className="text-[28px] leading-tight font-extrabold tracking-tight">
                      READY FOR PICKUP
                    </div>
                    <div className="mt-3 text-base font-semibold text-white/90">
                      Please collect at the booth now
                    </div>
                  </>
                ) : status === 'CANCELLED' ? (
                  <>
                    <div className="text-[26px] leading-tight font-extrabold tracking-tight text-red-600">CANCELLED</div>
                    <div className="mt-3 text-base text-neutral-700">
                      Your order has been cancelled.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[26px] leading-tight font-extrabold tracking-tight">
                      Preparing your order
                    </div>
                    <div className="mt-3 text-base text-neutral-700">
                      Your order is being prepared now.
                    </div>
                  </>
                )}
              </div>

                {!hasActiveOrder || pushUiState === 'enabled' ? null : (
                  <div
                    className={`mt-5 rounded-2xl p-4 border ${
                      status === 'READY'
                        ? 'border-white/20 bg-white/10'
                        : 'border-neutral-200 bg-neutral-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-full ${
                          status === 'READY' ? 'bg-white text-black' : 'bg-black text-white'
                        }`}
                      >
                        <Info size={16} />
                      </div>
                      <div className="min-w-0">
                        <div
                          className={`text-xs font-extrabold tracking-wide uppercase ${
                            status === 'READY' ? 'text-white' : 'text-black'
                          }`}
                        >
                          Notifications Off
                        </div>
                        <div
                          className={`mt-2 text-sm leading-snug ${
                            status === 'READY' ? 'text-white/90' : 'text-neutral-700'
                          }`}
                        >
                          Keep this tab open so you don’t miss updates, or enable notifications.
                        </div>
                        {pushError ? (
                          <div className={`mt-2 text-sm ${status === 'READY' ? 'text-white/90' : 'text-neutral-700'}`}>
                            {pushError}
                          </div>
                        ) : null}

                        <div className="mt-4 flex items-center gap-3">
                          <button
                            onClick={() => setNotifSheetOpen(true)}
                            className={`px-4 py-3 rounded-2xl text-sm font-semibold active:scale-[0.99] transition ${
                              status === 'READY'
                                ? 'bg-white text-black'
                                : 'bg-black text-white'
                            }`}
                          >
                            Enable Notifications
                          </button>
                          <button
                            onClick={continueWithoutNotifications}
                            className={`px-4 py-3 rounded-2xl text-sm font-semibold active:scale-[0.99] transition border ${
                              status === 'READY'
                                ? 'border-white/30 text-white'
                                : 'border-neutral-200 text-black'
                            }`}
                          >
                            Not Now
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-5 rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold text-black">Progress</div>
                  <div className="mt-4">
                    <OrderStatusStepper status={status} />
                  </div>
                </div>

                <div className="mt-5">
                  <div className="text-xs text-neutral-500 mb-2">
                    {order?.customerEmail && String(order.customerEmail).trim() !== ''
                      ? 'We’ll also send your order update by email when it’s ready.'
                      : 'Keep this page open to receive order updates here.'}
                  </div>
                  <div className="text-sm font-semibold text-black">Order Summary</div>
                  {items.length === 0 ? (
                    <div className="mt-2 text-sm text-neutral-600">Summary unavailable.</div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {items.map((it, idx) => (
                        <div key={idx} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
                          <div className="flex items-start gap-3">
                            <div className="w-14 h-14 rounded-2xl overflow-hidden bg-neutral-100 shrink-0">
                              {it.imageUrl && String(it.imageUrl).trim() !== '' ? (
                                <img
                                  src={String(it.imageUrl)}
                                  alt={it.name || 'Item'}
                                  className="w-14 h-14 object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="w-14 h-14 bg-gradient-to-br from-neutral-100 to-neutral-200" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-black">
                                {it.quantity}x {it.name || 'Item'}
                              </div>
                              {Array.isArray(it.selectedOptions) && it.selectedOptions.length > 0 ? (
                                <div className="mt-1 text-xs text-neutral-600">
                                  {it.selectedOptions
                                    .map((s: any) => {
                                      const title = String(s?.title || '');
                                      const choices = Array.isArray(s?.choices) ? s.choices : [];
                                      const labels = choices.map((c: any) => String(c?.label || '')).filter(Boolean);
                                      if (!title || labels.length === 0) return '';
                                      return `${title}: ${labels.join(', ')}`;
                                    })
                                    .filter(Boolean)
                                    .join(' • ')}
                                </div>
                              ) : null}
                              {it.remark && String(it.remark).trim() !== '' ? (
                                <div className="mt-1 text-sm text-neutral-600">
                                  <span className="text-neutral-500">Remark:</span> {String(it.remark)}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-6 space-y-3">
                  <button
                    onClick={() => {
                      requestLeave(() => {
                        if (!eventSlug) {
                          navigate('/', { replace: true });
                          return;
                        }
                        if (boothId) {
                          navigate(`/customer/event/${eventSlug}/booth/${boothId}`);
                          return;
                        }
                        if (vendorId) {
                          navigate(`/customer/event/${eventSlug}/order/${vendorId}`);
                          return;
                        }
                        navigate(`/customer/event/${eventSlug}`);
                      });
                    }}
                    className="w-full rounded-2xl py-4 text-sm font-bold shadow-md active:scale-[0.98] transition bg-black text-white"
                  >
                    Back to Menu
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

      <NotificationPromptSheet
        open={notifSheetOpen}
        pushUiState={pushUiState}
        pushBusy={pushBusy}
        pushError={pushError}
        canEnable={canEnableNotifications}
        onEnable={enableNotification}
        onContinue={continueWithoutNotifications}
        onClose={() => setNotifSheetOpen(false)}
      />
    </div>
  );
}

function NotificationPromptSheet({
  open,
  pushUiState,
  pushBusy,
  pushError,
  canEnable,
  onEnable,
  onContinue,
  onClose,
}: {
  open: boolean;
  pushUiState: 'checking' | 'available' | 'enabled' | 'blocked' | 'not_supported';
  pushBusy: boolean;
  pushError: string | null;
  canEnable: boolean;
  onEnable: () => void;
  onContinue: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const title =
    pushUiState === 'blocked'
      ? 'Notifications Blocked'
      : pushUiState === 'not_supported'
        ? 'Notifications Not Supported'
        : 'Enable Notifications';
  const body =
    pushUiState === 'blocked'
      ? 'Browser notifications are blocked for this site. You can still keep this page open to see status updates.'
      : pushUiState === 'not_supported'
        ? 'This browser does not support website notifications. Keep this page open to see status updates.'
        : 'Enable notifications so you get a clear alert when your order is READY.';

  const sheet = (
    <div className="fixed inset-0 z-50 bg-black/60" onMouseDown={onClose} onTouchStart={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl border-t border-neutral-200"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 flex items-center justify-between">
          <div className="text-base font-semibold text-black truncate">{title}</div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full border border-neutral-200 text-black bg-white active:scale-95 transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pb-5">
          <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-5">
            <div className="text-xs font-extrabold tracking-wide uppercase text-black">
              Important
            </div>
            <div className="mt-2 text-sm text-neutral-800 leading-snug">
              <span className="font-semibold text-black">{body}</span>
            </div>
            {pushError ? <div className="mt-3 text-sm text-red-600">{pushError}</div> : null}
          </div>

          <button
            onClick={onEnable}
            disabled={pushBusy || !canEnable}
            className="mt-4 w-full rounded-2xl py-4 text-sm font-semibold shadow-md active:scale-[0.99] transition disabled:opacity-60 bg-black text-white"
          >
            {pushBusy ? 'Enabling…' : canEnable ? 'Enable Notifications' : 'Enable Unavailable'}
          </button>

          <button
            onClick={onContinue}
            className="mt-3 w-full rounded-2xl py-4 text-sm font-semibold shadow-sm active:scale-[0.99] transition bg-white border border-neutral-200 text-black"
          >
            Continue without notifications
          </button>

          <div className="pt-[max(env(safe-area-inset-bottom),12px)]" />
        </div>
      </div>
    </div>
  );
  return createPortal(sheet, document.body);
}
