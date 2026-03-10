import { useState } from 'react';

type Props = {
  name: string;
  price: number;
  image?: string;
  description?: string;
  onAdd: (payload: { quantity: number; remark: string }) => void;
};

export function MenuCard({ name, price, image, description, onAdd }: Props) {
  const src = image && image.trim() !== '' ? image : '';
  const [quantity, setQuantity] = useState(1);
  const [remark, setRemark] = useState('');

  const dec = () => setQuantity((q) => Math.max(1, q - 1));
  const inc = () => setQuantity((q) => q + 1);

  return (
    <div className="bg-white rounded-2xl shadow-md overflow-hidden">
      <div className="w-full h-40 bg-gray-100">
        {src ? (
          <img
            src={src}
            alt={name}
            className="w-full h-40 object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-40 bg-gradient-to-br from-gray-100 to-gray-200" />
        )}
      </div>
      <div className="p-4">
        <div className="text-base font-semibold text-gray-900">{name}</div>
        {description ? (
          <div className="text-sm text-gray-500 mt-1 line-clamp-2">{description}</div>
        ) : null}

        <div className="mt-3 flex items-center justify-between">
          <div className="text-gray-900 font-semibold">${price.toFixed(2)}</div>
          <div className="flex items-center gap-3">
            <div className="text-xs font-semibold text-gray-600">Qty</div>
            <div className="flex items-center gap-2">
              <button
                onClick={dec}
                className="w-11 h-11 rounded-full border border-gray-200 text-lg leading-none bg-white active:scale-95 transition"
                aria-label={`Decrease quantity for ${name}`}
              >
                −
              </button>
              <div className="w-8 text-center font-semibold text-gray-900">{quantity}</div>
              <button
                onClick={inc}
                className="w-11 h-11 rounded-full border border-gray-200 text-lg leading-none bg-white active:scale-95 transition"
                aria-label={`Increase quantity for ${name}`}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold text-gray-600 mb-1">Remarks</div>
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            rows={2}
            placeholder="Less sugar / no ice / extra hot"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
          />
        </div>

        <button
          onClick={() => {
            onAdd({ quantity, remark });
            setQuantity(1);
            setRemark('');
          }}
          className="mt-4 w-full bg-black text-white rounded-2xl py-3 font-semibold shadow-md active:scale-[0.99] transition"
          aria-label={`Add ${name} to cart`}
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
}

export default MenuCard;
