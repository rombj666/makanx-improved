import { useCallback, useEffect, useMemo, useState } from 'react';

export type CartLine = {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  remark: string;
  imageUrl: string;
  selectedOptions?: { groupId: string; choiceIds: string[]; title?: string; choiceLabels?: string[] }[];
};

type CartState = {
  vendorId: string;
  vendorName: string;
  boothName: string;
  lines: CartLine[];
};

function storageKey(eventSlug: string, vendorId: string) {
  return `mx_cart_${eventSlug}_${vendorId}`;
}

function safeParse<T>(val: string | null, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clampQuantity(q: number) {
  if (!Number.isFinite(q)) return 1;
  return Math.max(1, Math.min(99, Math.floor(q)));
}

function normalizeSelectedOptions(input: CartLine['selectedOptions']): string {
  const list = Array.isArray(input) ? input : [];
  const normalized = list
    .map((s) => ({
      groupId: String((s as any)?.groupId || ''),
      choiceIds: Array.isArray((s as any)?.choiceIds) ? (s as any).choiceIds.map(String).filter(Boolean) : [],
    }))
    .filter((s) => s.groupId && s.choiceIds.length > 0)
    .map((s) => ({ ...s, choiceIds: Array.from(new Set(s.choiceIds)).sort() }))
    .sort((a, b) => a.groupId.localeCompare(b.groupId));
  return JSON.stringify(normalized);
}

export function useCustomerCart(params: {
  eventSlug: string;
  vendorId: string;
  vendorName?: string;
  boothName?: string;
}) {
  const { eventSlug, vendorId, vendorName = '', boothName = '' } = params;
  const key = useMemo(() => storageKey(eventSlug, vendorId), [eventSlug, vendorId]);

  const [state, setState] = useState<CartState>(() => ({
    vendorId,
    vendorName,
    boothName,
    lines: [],
  }));

  useEffect(() => {
    if (!eventSlug || !vendorId) return;
    const loaded = safeParse<CartState>(localStorage.getItem(key), {
      vendorId,
      vendorName,
      boothName,
      lines: [],
    });
    setState({
      vendorId,
      vendorName: loaded.vendorName || vendorName,
      boothName: loaded.boothName || boothName,
      lines: Array.isArray(loaded.lines) ? loaded.lines : [],
    });
  }, [key, eventSlug, vendorId, vendorName, boothName]);

  useEffect(() => {
    if (!eventSlug || !vendorId) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state, eventSlug, vendorId]);

  const addLine = useCallback(
    (input: Omit<CartLine, 'id'>) => {
      setState((prev) => {
        const normalizedRemark = (input.remark || '').trim();
        const qty = clampQuantity(input.quantity);
        const sig = normalizeSelectedOptions(input.selectedOptions);
        const idx = prev.lines.findIndex(
          (l) =>
            l.menuItemId === input.menuItemId &&
            (l.remark || '').trim() === normalizedRemark &&
            normalizeSelectedOptions(l.selectedOptions) === sig
        );
        const nextLines =
          idx >= 0
            ? prev.lines.map((l, i) =>
                i === idx ? { ...l, quantity: clampQuantity(l.quantity + qty) } : l
              )
            : prev.lines.concat({
                ...input,
                id: newId(),
                quantity: qty,
                remark: normalizedRemark,
              });
        return {
          vendorId,
          vendorName: prev.vendorName || vendorName,
          boothName: prev.boothName || boothName,
          lines: nextLines,
        };
      });
    },
    [vendorId, vendorName, boothName]
  );

  const updateQuantity = useCallback((id: string, quantity: number) => {
    setState((prev) => {
      const next = prev.lines
        .map((l) => (l.id === id ? { ...l, quantity: clampQuantity(quantity) } : l))
        .filter((l) => l.quantity > 0);
      return { ...prev, lines: next };
    });
  }, []);

  const updateRemark = useCallback((id: string, remark: string) => {
    setState((prev) => {
      const next = prev.lines.map((l) => (l.id === id ? { ...l, remark } : l));
      return { ...prev, lines: next };
    });
  }, []);

  const removeLine = useCallback((id: string) => {
    setState((prev) => ({ ...prev, lines: prev.lines.filter((l) => l.id !== id) }));
  }, []);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {}
    setState((prev) => ({ ...prev, lines: [] }));
  }, [key]);

  const subtotal = useMemo(
    () => state.lines.reduce((sum, l) => sum + l.price * l.quantity, 0),
    [state.lines]
  );
  const total = subtotal;
  const totalItems = useMemo(
    () => state.lines.reduce((sum, l) => sum + l.quantity, 0),
    [state.lines]
  );

  return {
    vendorId: state.vendorId,
    vendorName: state.vendorName,
    boothName: state.boothName,
    lines: state.lines,
    addLine,
    updateQuantity,
    updateRemark,
    removeLine,
    clear,
    subtotal,
    total,
    totalItems,
  };
}
