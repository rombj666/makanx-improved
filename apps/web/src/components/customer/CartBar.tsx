type Props = {
  totalItems: number;
  totalPrice: number;
  onViewCart: () => void;
  hidePrices?: boolean;
  topText?: string;
  bottomText?: string;
  actionLabel?: string;
  onOpenSummary?: () => void;
};

export function CartBar({
  totalItems,
  totalPrice,
  onViewCart,
  hidePrices,
  topText,
  bottomText,
  actionLabel,
  onOpenSummary,
}: Props) {
  const top = topText ?? `${totalItems} ${totalItems === 1 ? 'item' : 'items'}`;
  const bottom =
    bottomText ??
    (!hidePrices && totalItems > 0 ? `RM${totalPrice.toFixed(2)}` : '');
  const label = actionLabel ?? 'View';
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="mx-4 mb-4 rounded-3xl shadow-2xl bg-white border border-neutral-100 overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          {onOpenSummary ? (
            <button
              type="button"
              onClick={onOpenSummary}
              className="min-w-0 text-left"
              aria-label="Open summary"
            >
              <div className="text-xs font-semibold text-neutral-600">{top}</div>
              {bottom ? <div className="text-base font-semibold text-black">{bottom}</div> : null}
            </button>
          ) : (
            <div className="min-w-0">
              <div className="text-xs font-semibold text-neutral-600">{top}</div>
              {bottom ? <div className="text-base font-semibold text-black">{bottom}</div> : null}
            </div>
          )}
          <button
            onClick={onViewCart}
            className="px-5 py-3 bg-black text-white rounded-2xl text-sm font-semibold active:scale-95 transition"
            aria-label={label}
          >
            {label}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CartBar;
