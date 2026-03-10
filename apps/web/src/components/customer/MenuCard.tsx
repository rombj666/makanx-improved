type Props = {
  name: string;
  price: number;
  image?: string;
  description?: string;
  onAdd: () => void;
};

export function MenuCard({ name, price, image, description, onAdd }: Props) {
  const src = image && image.trim() !== '' ? image : '';
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
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-gray-900 truncate">{name}</div>
            {description ? (
              <div className="text-sm text-gray-500 mt-0.5 line-clamp-2">{description}</div>
            ) : null}
          </div>
          <button
            aria-label={`Add ${name}`}
            onClick={onAdd}
            className="flex items-center justify-center bg-yellow-500 text-black rounded-full w-11 h-11 active:scale-95 transition"
          >
            <span className="text-xl leading-none">+</span>
          </button>
        </div>
        <div className="mt-3 text-gray-900 font-semibold">${price.toFixed(2)}</div>
      </div>
    </div>
  );
}

export default MenuCard;
