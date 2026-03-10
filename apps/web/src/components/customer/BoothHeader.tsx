type Props = {
  boothName?: string | null;
  boothNumber?: string | null;
  vendorName?: string | null;
  description?: string | null;
  heroImageUrl?: string | null;
  prepTimeMinutes?: number | null;
  rating?: number | null;
  onBack?: (() => void) | null;
};

export function BoothHeader({
  boothName,
  boothNumber,
  vendorName,
  description,
  heroImageUrl,
  rating,
  prepTimeMinutes,
  onBack,
}: Props) {
  const title = vendorName || boothName || 'Vendor';
  return (
    <div className="bg-[#FAF7F0]">
      <div className="px-4 pt-4">
        <div className="flex items-center gap-3">
          {onBack ? (
            <button
              onClick={onBack}
              className="w-11 h-11 rounded-full bg-white shadow-md flex items-center justify-center active:scale-95 transition"
              aria-label="Back"
            >
              ←
            </button>
          ) : null}
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-500">
              Booth {boothNumber || '—'}
            </div>
            <div className="text-2xl font-extrabold text-gray-900 truncate">{title}</div>
          </div>
        </div>
      </div>

      {heroImageUrl ? (
        <div className="mt-4 px-4">
          <div className="rounded-3xl overflow-hidden shadow-md bg-white">
            <img
              src={heroImageUrl}
              alt={title}
              className="w-full h-44 object-cover"
              loading="lazy"
            />
          </div>
        </div>
      ) : null}

      <div className="px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-gray-600 min-w-0">
            {description ? <div className="line-clamp-2">{description}</div> : null}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-xs text-gray-500">Prep</div>
              <div className="text-sm font-semibold text-gray-900">
                {prepTimeMinutes != null ? `~${prepTimeMinutes} min` : 'Varies'}
              </div>
            </div>
            <div className="w-px h-9 bg-gray-200" />
            <div className="text-right">
              <div className="text-xs text-gray-500">Rating</div>
              <div className="text-sm font-semibold text-gray-900">
                {rating != null ? rating.toFixed(1) : '—'} <span className="text-yellow-500">★</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="h-px bg-gray-200" />
    </div>
  );
}

export default BoothHeader;
