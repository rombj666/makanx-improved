type Props = {
  name: string;
  price: number;
  image?: string;
  onClick: () => void;
  className?: string;
  hidePrice?: boolean;
  isAvailable?: boolean;
};

export function MenuCard({ name, price, image, onClick, className, hidePrice, isAvailable = true }: Props) {
  const src = image && image.trim() !== '' ? image : '';

  const isSoldOut = isAvailable === false;

  return (
    <button
      type="button"
      onClick={() => {
        if (!isSoldOut) onClick();
      }}
      className={[
        'bg-white rounded-3xl shadow-sm border border-neutral-100 overflow-hidden text-left active:scale-[0.99] transition h-full flex flex-col',
        isSoldOut ? 'opacity-60 grayscale-[0.5]' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="w-full aspect-[16/10] bg-neutral-100">
        {src ? (
          <img
            src={src}
            alt={name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-neutral-100 to-neutral-200" />
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-semibold text-black line-clamp-2 leading-snug">{name}</div>
          {isSoldOut && (
            <span className="shrink-0 px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-bold border border-red-100 uppercase tracking-wider">
              Sold Out
            </span>
          )}
        </div>
        {!hidePrice ? (
          <div className="mt-1 text-sm text-neutral-800 font-semibold">RM{price.toFixed(2)}</div>
        ) : null}
      </div>
    </button>
  );
}

export default MenuCard;
