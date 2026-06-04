import React from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-hot-toast';

type OptionChoice = { id: string; label: string; priceDelta?: number };
type OptionGroup = {
  id: string;
  title: string;
  type: 'single' | 'multi';
  required: boolean;
  choices: OptionChoice[];
};

type Props = {
  isOpen: boolean;
  name: string;
  price: number;
  imageUrl?: string;
  optionGroups?: OptionGroup[];
  remarksEnabled?: boolean;
  hidePrice?: boolean;
  maxQuantity?: number;
  addDisabled?: boolean;
  disabledMessage?: string;
  onClose: () => void;
  onAdd: (payload: {
    quantity: number;
    remark: string;
    selectedOptions: { groupId: string; choiceIds: string[] }[];
  }) => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function ProductDetailSheet({
  isOpen,
  name,
  price,
  imageUrl,
  optionGroups,
  remarksEnabled,
  hidePrice,
  maxQuantity = 99,
  addDisabled = false,
  disabledMessage,
  onClose,
  onAdd,
}: Props) {
  const src = imageUrl && imageUrl.trim() !== '' ? imageUrl : '';
  if (!isOpen) return null;
  const groups = Array.isArray(optionGroups) ? optionGroups : [];
  const allowRemarks = remarksEnabled !== false;

  const sheet = (
    <div
      className="fixed inset-0 z-50 bg-black/60"
      onMouseDown={onClose}
      onTouchStart={onClose}
    >
      <div
        className="absolute inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <ProductDetailSheetBody
          name={name}
          price={price}
          src={src}
          optionGroups={groups}
          remarksEnabled={allowRemarks}
          hidePrice={hidePrice === true}
          maxQuantity={Math.max(0, Math.floor(maxQuantity))}
          addDisabled={addDisabled}
          disabledMessage={disabledMessage}
          onClose={onClose}
          onAdd={onAdd}
        />
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}

function ProductDetailSheetBody({
  name,
  price,
  src,
  optionGroups,
  remarksEnabled,
  hidePrice,
  maxQuantity,
  addDisabled,
  disabledMessage,
  onClose,
  onAdd,
}: {
  name: string;
  price: number;
  src: string;
  optionGroups: OptionGroup[];
  remarksEnabled: boolean;
  hidePrice: boolean;
  maxQuantity: number;
  addDisabled: boolean;
  disabledMessage?: string;
  onClose: () => void;
  onAdd: (payload: {
    quantity: number;
    remark: string;
    selectedOptions: { groupId: string; choiceIds: string[] }[];
  }) => void;
}) {
  const [quantity, setQuantity] = React.useState(1);
  const [draftQty, setDraftQty] = React.useState('1');
  const [remark, setRemark] = React.useState('');
  const [selected, setSelected] = React.useState<Record<string, string[]>>({});

  const setBothQty = (q: number) => {
    const next = clamp(q, 1, Math.max(1, maxQuantity));
    setQuantity(next);
    setDraftQty(String(next));
  };
  const dec = () => setBothQty(quantity - 1);
  const inc = () => {
    if (quantity >= maxQuantity) {
      if (disabledMessage) toast.error(disabledMessage);
      return;
    }
    setBothQty(quantity + 1);
  };

  const commitQty = (raw: string) => {
    const trimmed = String(raw || '').trim();
    if (trimmed === '') {
      setDraftQty(String(quantity));
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setDraftQty(String(quantity));
      return;
    }
    setBothQty(Math.floor(parsed));
  };

  React.useEffect(() => {
    if (!remarksEnabled) setRemark('');
  }, [remarksEnabled]);

  return (
    <div className="max-h-[85vh] overflow-y-auto">
      <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-neutral-100">
        <div className="text-base font-semibold text-black truncate">{name}</div>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full border border-neutral-200 text-black active:scale-95 transition"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="p-5">
        <div className="w-full aspect-[16/10] rounded-2xl overflow-hidden bg-neutral-100">
          {src ? (
            <img src={src} alt={name} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-neutral-100 to-neutral-200" />
          )}
        </div>

        <div className="mt-4 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-black truncate">{name}</div>
            {!hidePrice ? <div className="text-sm text-neutral-600">RM{price.toFixed(2)}</div> : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={dec}
              disabled={quantity <= 1}
              className="w-12 h-12 rounded-full border border-neutral-200 text-lg bg-white disabled:opacity-40 active:scale-95 transition"
              aria-label="Decrease quantity"
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
              className="w-14 h-12 rounded-2xl border border-neutral-200 bg-white text-center font-semibold text-black outline-none focus:ring-2 focus:ring-black/20 focus:border-neutral-300"
              aria-label="Quantity"
            />
            <button
              onClick={inc}
              disabled={quantity >= maxQuantity}
              className="w-12 h-12 rounded-full border border-neutral-200 text-lg bg-white disabled:opacity-40 active:scale-95 transition"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        </div>

        {optionGroups.length > 0 ? (
          <div className="mt-6 space-y-5">
            {optionGroups.map((g) => {
              const choices = Array.isArray(g.choices) ? g.choices : [];
              const chosen = Array.isArray(selected[g.id]) ? selected[g.id] : [];
              return (
                <div key={g.id}>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-neutral-600">
                      {g.title || 'Options'}
                      {g.required ? <span className="text-neutral-500"> (Required)</span> : null}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {choices.map((c) => {
                      const checked = chosen.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm active:scale-[0.99] transition"
                        >
                          <div className="text-black">{c.label}</div>
                          <input
                            type={g.type === 'multi' ? 'checkbox' : 'radio'}
                            name={`g_${g.id}`}
                            checked={checked}
                            onChange={() => {
                              setSelected((prev) => {
                                const prevIds = Array.isArray(prev[g.id]) ? prev[g.id] : [];
                                if (g.type === 'multi') {
                                  const next = checked
                                    ? prevIds.filter((x) => x !== c.id)
                                    : prevIds.concat(c.id);
                                  return { ...prev, [g.id]: next };
                                }
                                return { ...prev, [g.id]: [c.id] };
                              });
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {remarksEnabled ? (
          <div className="mt-6">
            <div className="text-xs font-semibold text-neutral-600 mb-2">Remarks</div>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={3}
              placeholder="Add a note for the vendor"
              className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black/20 focus:border-neutral-300"
            />
          </div>
        ) : null}

        <button
          onClick={() => {
            if (addDisabled || maxQuantity < 1) {
              if (disabledMessage) toast.error(disabledMessage);
              return;
            }
            const requiredMissing = optionGroups.find((g) => {
              if (!g.required) return false;
              const chosen = Array.isArray(selected[g.id]) ? selected[g.id] : [];
              return chosen.length === 0;
            });
            if (requiredMissing) {
              toast.error(`Please select: ${requiredMissing.title || 'Required option'}`);
              return;
            }
            const selectedOptions = optionGroups
              .map((g) => {
                const ids = Array.isArray(selected[g.id]) ? selected[g.id] : [];
                const choiceMap = new Map<string, string>();
                for (const c of Array.isArray(g.choices) ? g.choices : []) {
                  choiceMap.set(c.id, c.label);
                }
                const labels = ids.map((id) => choiceMap.get(id) || '').filter(Boolean);
                return { groupId: g.id, choiceIds: ids, title: g.title, choiceLabels: labels };
              })
              .filter((x) => x.choiceIds.length > 0);

            onAdd({ quantity, remark: remarksEnabled ? remark.trim() : '', selectedOptions });
            setQuantity(1);
            setDraftQty('1');
            setRemark('');
            setSelected({});
            onClose();
          }}
          disabled={addDisabled || maxQuantity < 1}
          className="mt-5 w-full bg-black text-white rounded-2xl py-4 text-base font-semibold shadow-lg active:scale-[0.99] transition disabled:opacity-50"
        >
          Add to Cart
        </button>
        <div className="h-5" />
      </div>
    </div>
  );
}
