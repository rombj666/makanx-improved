type Props = {
  booth: any;
  open: boolean;
  onClose: () => void;
  onPlaceOrder: () => void;
};

export function VendorBottomSheet({ booth, open, onClose, onPlaceOrder }: Props) {
  if (!open) return null;

  const vendor = booth?.vendor || null;
  const boothCode = booth?.name || '';
  const vendorName = vendor?.businessName || 'Available Booth';
  const description = vendor?.description || '';
  const status = booth?.status || '';

  const menuItems = Array.isArray(vendor?.menuItems) ? vendor.menuItems : [];
  const preview = menuItems.slice(0, 3);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40">
      <div className="mx-0">
        <div className="bg-white rounded-t-3xl shadow-2xl border-t border-gray-100">
          <div className="px-4 pt-3 pb-2">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
          </div>

          <div className="px-4 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-gray-500">Booth {boothCode}</div>
                <div className="text-2xl font-extrabold text-gray-900 truncate">{vendorName}</div>
              </div>
              <button
                onClick={onClose}
                className="w-11 h-11 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center active:scale-95 transition"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {status ? (
              <div className="mt-2">
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                    String(status).toLowerCase().includes('open')
                      ? 'bg-green-50 text-green-700'
                      : String(status).toLowerCase().includes('closed')
                        ? 'bg-gray-100 text-gray-600'
                        : 'bg-yellow-50 text-yellow-700'
                  }`}
                >
                  {String(status)}
                </span>
              </div>
            ) : null}

            {description ? (
              <div className="mt-3 text-sm text-gray-600 line-clamp-3">{description}</div>
            ) : null}

            {preview.length > 0 ? (
              <div className="mt-4">
                <div className="text-xs font-semibold text-gray-500 mb-2">Popular items</div>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {preview.map((m: any) => (
                    <div
                      key={m.id}
                      className="min-w-[180px] rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden"
                    >
                      {m.imageUrl ? (
                        <img src={m.imageUrl} alt={m.name} className="w-full h-20 object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-20 bg-gradient-to-br from-gray-100 to-gray-200" />
                      )}
                      <div className="p-3">
                        <div className="text-sm font-semibold text-gray-900 truncate">{m.name}</div>
                        <div className="text-sm font-bold text-gray-900 mt-1">${Number(m.price).toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <button
              onClick={onPlaceOrder}
              disabled={!vendor}
              className="mt-5 w-full bg-black text-white rounded-2xl py-4 text-base font-semibold shadow-xl disabled:opacity-50 active:scale-[0.99] transition"
            >
              Place Order
            </button>

            <div className="mt-3 pb-[max(env(safe-area-inset-bottom),12px)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default VendorBottomSheet;

