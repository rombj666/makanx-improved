import { CartLine } from '../../hooks/useCustomerCart';

type Props = {
  line: CartLine;
  onQuantityChange: (quantity: number) => void;
  onRemarkChange: (remark: string) => void;
  onRemove: () => void;
};

export function CartItem({ line, onQuantityChange, onRemarkChange, onRemove }: Props) {
  const dec = () => onQuantityChange(Math.max(0, line.quantity - 1));
  const inc = () => onQuantityChange(line.quantity + 1);
  const src = line.imageUrl && line.imageUrl.trim() !== '' ? line.imageUrl : '';

  return (
    <div className="bg-white rounded-2xl shadow-md overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gray-100 shrink-0">
            {src ? (
              <img src={src} alt={line.name} className="w-20 h-20 object-cover" loading="lazy" />
            ) : (
              <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 truncate">{line.name}</div>
                <div className="text-sm text-gray-500">${line.price.toFixed(2)}</div>
              </div>
              <button
                onClick={onRemove}
                className="w-11 h-11 rounded-full bg-white border border-gray-200 shadow-sm active:scale-95 transition"
                aria-label={`Remove ${line.name}`}
              >
                ✕
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-600">Qty</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={dec}
                  className="w-11 h-11 rounded-full border border-gray-200 text-lg leading-none bg-white active:scale-95 transition"
                  aria-label={`Decrease quantity for ${line.name}`}
                >
                  −
                </button>
                <div className="w-8 text-center font-semibold text-gray-900">{line.quantity}</div>
                <button
                  onClick={inc}
                  className="w-11 h-11 rounded-full border border-gray-200 text-lg leading-none bg-white active:scale-95 transition"
                  aria-label={`Increase quantity for ${line.name}`}
                >
                  +
                </button>
              </div>
            </div>

            <div className="mt-3">
              <div className="text-xs font-semibold text-gray-600 mb-1">Remarks</div>
              <textarea
                value={line.remark || ''}
                onChange={(e) => onRemarkChange(e.target.value)}
                rows={2}
                placeholder="Less sugar / no ice / extra hot"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CartItem;

