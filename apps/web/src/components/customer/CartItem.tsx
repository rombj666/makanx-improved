import { useEffect, useState } from 'react';
import { CartLine } from '../../hooks/useCustomerCart';

type Props = {
  line: CartLine;
  onQuantityChange: (quantity: number) => void;
  onRemarkChange: (remark: string) => void;
  onRemove: () => void;
  hidePrices?: boolean;
};

export function CartItem({ line, onQuantityChange, onRemarkChange, onRemove, hidePrices }: Props) {
  const dec = () => onQuantityChange(Math.max(1, line.quantity - 1));
  const inc = () => onQuantityChange(Math.min(99, line.quantity + 1));
  const src = line.imageUrl && line.imageUrl.trim() !== '' ? line.imageUrl : '';
  const allowRemarks = (line as any).remarksEnabled !== false;
  const [draftQty, setDraftQty] = useState<string>(String(line.quantity));

  useEffect(() => {
    setDraftQty(String(line.quantity));
  }, [line.quantity]);

  const commitQty = (raw: string) => {
    const trimmed = String(raw || '').trim();
    if (trimmed === '') {
      setDraftQty(String(line.quantity));
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setDraftQty(String(line.quantity));
      return;
    }
    const clamped = Math.max(1, Math.min(99, Math.floor(parsed)));
    setDraftQty(String(clamped));
    onQuantityChange(clamped);
  };
  const selectedSummary = Array.isArray((line as any).selectedOptions)
    ? (line as any).selectedOptions
        .map((s: any) => {
          const title = typeof s?.title === 'string' ? s.title : '';
          const labels = Array.isArray(s?.choiceLabels) ? s.choiceLabels.filter(Boolean) : [];
          if (!title || labels.length === 0) return '';
          return `${title}: ${labels.join(', ')}`;
        })
        .filter(Boolean)
        .join(' • ')
    : '';

  return (
    <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded-2xl overflow-hidden bg-neutral-100 shrink-0">
            {src ? (
              <img src={src} alt={line.name} className="w-20 h-20 object-cover" loading="lazy" />
            ) : (
              <div className="w-20 h-20 bg-gradient-to-br from-neutral-100 to-neutral-200" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-black truncate">{line.name}</div>
                {!hidePrices ? (
                  <div className="text-sm text-neutral-600">RM{line.price.toFixed(2)}</div>
                ) : null}
                  {selectedSummary ? (
                    <div className="mt-1 text-xs text-neutral-600 line-clamp-2">{selectedSummary}</div>
                  ) : null}
              </div>
              <button
                onClick={onRemove}
                className="w-10 h-10 rounded-full bg-white border border-neutral-200 active:scale-95 transition"
                aria-label={`Remove ${line.name}`}
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs font-semibold text-neutral-600">Quantity</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={dec}
                  disabled={line.quantity <= 1}
                  className="w-11 h-11 rounded-full border border-neutral-200 text-lg leading-none bg-white disabled:opacity-40 active:scale-95 transition"
                  aria-label={`Decrease quantity for ${line.name}`}
                >
                  −
                </button>
                <input
                  value={draftQty}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next === '') {
                      setDraftQty('');
                      return;
                    }
                    const sanitized = next.replace(/[^\d]/g, '').slice(0, 2);
                    setDraftQty(sanitized);
                  }}
                  onBlur={() => commitQty(draftQty)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitQty(draftQty);
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="w-12 h-11 rounded-2xl border border-neutral-200 bg-white text-center font-semibold text-black outline-none focus:ring-2 focus:ring-black/20 focus:border-neutral-300"
                  aria-label={`Quantity for ${line.name}`}
                />
                <button
                  onClick={inc}
                  disabled={line.quantity >= 99}
                  className="w-11 h-11 rounded-full border border-neutral-200 text-lg leading-none bg-white disabled:opacity-40 active:scale-95 transition"
                  aria-label={`Increase quantity for ${line.name}`}
                >
                  +
                </button>
              </div>
            </div>

            {allowRemarks ? (
              <div className="mt-4">
                <div className="text-xs font-semibold text-neutral-600 mb-2">Remarks</div>
                <textarea
                  value={line.remark || ''}
                  onChange={(e) => onRemarkChange(e.target.value)}
                  rows={2}
                  placeholder="Add a note for the vendor"
                  className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black/20 focus:border-neutral-300"
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CartItem;
