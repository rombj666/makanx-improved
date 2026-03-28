type Props = {
  boothName?: string | null;
  boothNumber?: string | null;
  vendorName?: string | null;
  description?: string | null;
  heroImageUrl?: string | null;
  prepTimeMinutes?: number | null;
  onBack?: (() => void) | null;
};

export function BoothHeader({
  boothName,
  boothNumber,
  vendorName,
  description,
  heroImageUrl,
  prepTimeMinutes,
  onBack,
}: Props) {
  const title = vendorName || boothName || 'Vendor';
  return (
    <div className="bg-neutral-50">
      <div className="px-4 pt-4">
        <div className="flex items-center gap-3">
          {onBack ? (
            <button
              onClick={onBack}
              className="w-11 h-11 rounded-full bg-white border border-neutral-200 flex items-center justify-center active:scale-95 transition"
              aria-label="Back"
            >
              ←
            </button>
          ) : null}
          <div className="min-w-0">
            <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">
              Booth {boothNumber || '—'}
            </div>
            <div className="text-2xl font-semibold text-black truncate">{title}</div>
          </div>
        </div>
      </div>

      {heroImageUrl ? (
        <div className="mt-4 px-4">
          <div className="rounded-3xl overflow-hidden shadow-md bg-white">
            <img
              src={heroImageUrl}
              alt={title}
              className="w-full h-[22vh] max-h-[200px] sm:h-[20vh] sm:max-h-[180px] object-cover"
              loading="lazy"
            />
          </div>
        </div>
      ) : null}

      <div className="px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-neutral-600 min-w-0">
            {description ? <div className="line-clamp-2">{description}</div> : null}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-xs text-neutral-500 tracking-wide uppercase">Prep</div>
              <div className="text-sm font-semibold text-black">
                {prepTimeMinutes != null ? `~${prepTimeMinutes} min` : '—'}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="h-px bg-neutral-200" />
    </div>
  );
}

export default BoothHeader;
