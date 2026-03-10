type Props = {
  boothName?: string | null;
  boothNumber?: string | null;
  vendorName?: string | null;
  rating?: number | null;
  prepTimeMinutes?: number | null;
};

export function BoothHeader({
  boothName,
  boothNumber,
  vendorName,
  rating,
  prepTimeMinutes,
}: Props) {
  return (
    <div className="bg-white">
      <div className="px-4 py-5 border-b">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-2xl font-bold text-gray-900">{vendorName || boothName || 'Vendor'}</div>
            <div className="text-sm text-gray-500">
              Booth {boothNumber || '—'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-700">
              <span className="font-semibold">{rating != null ? rating.toFixed(1) : '—'}</span>
              <span className="text-gray-400"> ★</span>
            </div>
            <div className="text-xs text-gray-500">
              Prep {prepTimeMinutes != null ? `${prepTimeMinutes} min` : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BoothHeader;
