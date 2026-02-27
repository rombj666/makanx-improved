import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { getOrCreateGuestId } from '../lib/guest';
import { useSocket } from '../context/SocketContext';
import { playReadySound, vibrateReady } from '../lib/alerts';
import { toast } from 'react-hot-toast';

export type ActiveOrder = {
  orderId: string;
  vendorId: string;
  vendorName?: string;
  status: string;
  estimatedMinutes: number;
  createdAt: string;
  updatedAt: string;
  displayNumber: string;
};

function storageKey(slug: string) {
  return `mx_active_orders_${slug}`;
}

function safeParse<T>(val: string | null, fallback: T): T {
  if (!val) return fallback;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

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
  return id ? id.slice(-4).toUpperCase() : '----';
}

export function useCustomerOrders(eventSlug: string | undefined) {
  const slug = eventSlug || '';
  const { socket } = useSocket();
  const [orders, setOrders] = useState<ActiveOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const key = useMemo(() => storageKey(slug), [slug]);

  // Initial load from localStorage
  useEffect(() => {
    if (!slug) return;
    const saved = safeParse<ActiveOrder[]>(localStorage.getItem(key), []);
    setOrders(saved);
  }, [key, slug]);

  // Fetch from backend and merge
  useEffect(() => {
    const fetchAndMerge = async () => {
      if (!slug) return;
      setIsLoading(true);
      try {
        const guestId = getOrCreateGuestId();
        const { data } = await api.get(`/orders/my-orders`, {
          params: { guestId },
        });
        const serverOrders: any[] = data?.data || [];
        const normalized: ActiveOrder[] = serverOrders.map((o: any) => ({
          orderId: o.id,
          vendorId: o.vendorId,
          vendorName: o.vendor?.businessName || o.vendorName || '',
          status: o.status,
          estimatedMinutes: Math.max(Number(o.estimatedMinutes ?? 0), 0),
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
          displayNumber: computeDisplayNumber(o),
        }));
        setOrders((prev) => {
          const map = new Map<string, ActiveOrder>();
          [...prev, ...normalized].forEach((ord) => {
            const existing = map.get(ord.orderId);
            if (!existing) {
              map.set(ord.orderId, ord);
            } else {
              map.set(ord.orderId, { ...existing, ...ord });
            }
          });
          const merged = Array.from(map.values()).filter(
            (o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED'
          );
          localStorage.setItem(key, JSON.stringify(merged));
          return merged;
        });
      } catch {
        // ignore fetch errors, keep local data
      } finally {
        setIsLoading(false);
      }
    };
    fetchAndMerge();
  }, [slug, key]);

  // Socket updates
  useEffect(() => {
    if (!socket) return;

    const onUpdate = (updated: any) => {
      const upd: Partial<ActiveOrder> = {
        orderId: updated.id,
        status: updated.status,
        updatedAt: updated.updatedAt,
        estimatedMinutes: Math.max(Number(updated.estimatedMinutes ?? 0), 0),
        displayNumber: computeDisplayNumber(updated),
        vendorName: updated.vendor?.businessName || updated.vendorName,
        vendorId: updated.vendorId,
      };
      setOrders((prev) => {
        const next = prev.slice();
        const idx = next.findIndex((o) => o.orderId === upd.orderId);
        let becameReady = false;
        let displayNum = upd.displayNumber || computeDisplayNumber(updated);
        if (idx >= 0) {
          const old = next[idx];
          const merged = { ...old, ...upd };
          if (old.status !== 'READY' && merged.status === 'READY') {
            becameReady = true;
            displayNum = merged.displayNumber;
          }
          if (merged.status === 'COMPLETED' || merged.status === 'CANCELLED') {
            next.splice(idx, 1);
          } else {
            next[idx] = merged;
          }
        } else {
          if (upd.orderId && upd.status !== 'COMPLETED' && upd.status !== 'CANCELLED') {
            const newEntry = {
              orderId: upd.orderId!,
              vendorId: upd.vendorId || '',
              vendorName: upd.vendorName || '',
              status: upd.status || 'PENDING',
              estimatedMinutes: upd.estimatedMinutes ?? 0,
              createdAt: updated.createdAt || new Date().toISOString(),
              updatedAt: updated.updatedAt || new Date().toISOString(),
              displayNumber: displayNum,
            };
            if (newEntry.status === 'READY') {
              becameReady = true;
            }
            next.unshift(newEntry);
          }
        }
        localStorage.setItem(key, JSON.stringify(next));
        if (becameReady) {
          toast.success(`Order #${displayNum} is READY — come collect`);
          playReadySound();
          vibrateReady();
        }
        return next;
      });
    };

    socket.on('order_updated', onUpdate);
    return () => {
      socket.off('order_updated', onUpdate);
    };
  }, [socket, key]);

  const addOrUpdate = useCallback(
    (order: ActiveOrder) => {
      setOrders((prev) => {
        const next = prev.slice();
        const idx = next.findIndex((o) => o.orderId === order.orderId);
        if (idx >= 0) {
          next[idx] = { ...next[idx], ...order };
        } else {
          next.unshift(order);
        }
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      });
    },
    [key]
  );

  const remove = useCallback(
    (orderId: string) => {
      setOrders((prev) => {
        const next = prev.filter((o) => o.orderId !== orderId);
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      });
    },
    [key]
  );

  const decrementEta = useCallback(() => {
    setOrders((prev) => {
      const next = prev.map((o) => ({
        ...o,
        estimatedMinutes: Math.max((o.estimatedMinutes ?? 0) - 1, 0),
      }));
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, [key]);

  return { orders, isLoading, addOrUpdate, remove, decrementEta };
}
