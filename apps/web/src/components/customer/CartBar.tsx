type Props = {
  totalItems: number;
  totalPrice: number;
  onViewCart: () => void;
};

export function CartBar({ totalItems, totalPrice, onViewCart }: Props) {
  if (totalItems <= 0) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <div className="mx-4 mb-4 rounded-2xl shadow-xl bg-white">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-2xl">🛒</div>
              <div className="text-sm text-gray-700">
                <div className="font-semibold">
                  {totalItems} {totalItems === 1 ? 'item' : 'items'} <span className="text-gray-300 mx-2">•</span>{' '}
                  <span className="text-gray-900">${totalPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>
            <button
              onClick={onViewCart}
              className="px-4 py-2 bg-black text-white rounded-full text-sm font-semibold active:scale-95 transition"
              aria-label="View Cart"
            >
              View Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CartBar;
