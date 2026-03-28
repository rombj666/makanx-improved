type Props = {
  totalItems: number;
  totalPrice: number;
  onViewCart: () => void;
};

export function CartBar({ totalItems, totalPrice, onViewCart }: Props) {
  if (totalItems <= 0) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="mx-4 mb-4 rounded-3xl shadow-2xl bg-white border border-neutral-100 overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-neutral-600">
              {totalItems} {totalItems === 1 ? 'item' : 'items'}
            </div>
            <div className="text-base font-semibold text-black">RM{totalPrice.toFixed(2)}</div>
          </div>
          <button
            onClick={onViewCart}
            className="px-5 py-3 bg-black text-white rounded-2xl text-sm font-semibold active:scale-95 transition"
            aria-label="View Cart"
          >
            View Cart
          </button>
        </div>
      </div>
    </div>
  );
}

export default CartBar;
