type Props = {
  name: string;
  price: number;
  image?: string;
  onClick: () => void;
  className?: string;
  hidePrice?: boolean;
};

export function MenuCard({ name, price, image, onClick, className, hidePrice }: Props) {
  const src = image && image.trim() !== '' ? image : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'bg-white rounded-3xl shadow-sm border border-neutral-100 overflow-hidden text-left active:scale-[0.99] transition h-full flex flex-col',
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
        <div className="text-sm font-semibold text-black line-clamp-2 leading-snug">{name}</div>
        {!hidePrice ? (
          <div className="mt-1 text-sm text-neutral-800 font-semibold">RM{price.toFixed(2)}</div>
        ) : null}
      </div>
    </button>
  );
}

export default MenuCard;
