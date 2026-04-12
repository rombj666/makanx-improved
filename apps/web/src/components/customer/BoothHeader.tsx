type Props = {
  boothName?: string | null;
  boothNumber?: string | null;
  vendorName?: string | null;
  description?: string | null;
  heroImageUrl?: string | null;
  onBack?: (() => void) | null;
  showBackButton?: boolean;
  variant?: 'default' | 'minimal';
  className?: string;
};

export function BoothHeader({
  boothName,
  boothNumber,
  vendorName,
  description,
  heroImageUrl,
  onBack,
  showBackButton = true,
  variant = 'default',
  className,
}: Props) {
  const title = vendorName || boothName || 'Vendor';
  if (variant === 'minimal') {
    return (
      <div className={['bg-white', className].filter(Boolean).join(' ')}>
        <div className="px-4 pt-5 pb-4">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-neutral-400 tracking-[0.16em] uppercase">
                BOOTH{boothNumber ? <span className="ml-2 tracking-normal">• {boothNumber}</span> : null}
              </div>
              <div className="mt-1 text-3xl font-semibold text-black truncate">{boothName || title}</div>
            </div>
          </div>
        </div>
        <div className="h-px bg-neutral-900/10" />
      </div>
    );
  }
  return (
    <div className={['bg-neutral-50', className].filter(Boolean).join(' ')}>
      <div className="px-4 pt-4">
        <div className="flex items-center gap-3">
          {onBack && showBackButton ? (
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
        </div>
      </div>
      <div className="h-px bg-neutral-200" />
    </div>
  );
}

export default BoothHeader;
