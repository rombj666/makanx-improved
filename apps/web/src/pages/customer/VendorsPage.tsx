import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';

type Booth = {
  id: string;
  name: string;
  vendor?: {
    id: string;
    businessName: string;
    description?: string;
    menuItems?: { imageUrl?: string }[];
  };
};

export function VendorsPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const eventSlug = String(slug || '');
  const [booths, setBooths] = useState<Booth[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    const run = async () => {
      if (!eventSlug) return;
      try {
        const { data } = await api.get(`/events/${eventSlug}`);
        if (data.success) {
          setBooths(data.data?.booths || []);
        }
      } catch {
        setBooths([]);
      }
    };
    run();
  }, [eventSlug]);

  const vendors = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = booths
      .filter((b) => b.vendor?.id)
      .map((b) => ({
        boothId: b.id,
        boothName: b.name,
        vendorId: b.vendor!.id,
        vendorName: b.vendor!.businessName,
        description: b.vendor?.description || '',
        hero:
          b.vendor?.menuItems?.find((m) => (m.imageUrl || '').trim() !== '')?.imageUrl || '',
      }));
    if (!needle) return list;
    return list.filter(
      (v) =>
        v.vendorName.toLowerCase().includes(needle) ||
        v.boothName.toLowerCase().includes(needle) ||
        v.description.toLowerCase().includes(needle)
    );
  }, [booths, q]);

  return (
    <div className="w-full h-full bg-[#FAF7F0] flex flex-col">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/customer/event/${eventSlug}`)}
            className="w-11 h-11 rounded-full bg-white shadow-md flex items-center justify-center active:scale-95 transition"
            aria-label="Back to Map"
          >
            ←
          </button>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-500">Event Vendors</div>
            <div className="text-2xl font-extrabold text-gray-900">Browse Vendors</div>
          </div>
        </div>
        <div className="mt-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search vendor or booth…"
            className="w-full rounded-2xl px-4 py-3 bg-white shadow-md border border-gray-100 outline-none focus:ring-2 focus:ring-yellow-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-10">
        <div className="grid grid-cols-1 gap-4">
          {vendors.map((v) => (
            <button
              key={v.vendorId}
              onClick={() => navigate(`/customer/event/${eventSlug}/order/${v.vendorId}`)}
              className="text-left bg-white rounded-3xl shadow-md overflow-hidden active:scale-[0.99] transition"
            >
              {v.hero ? (
                <img src={v.hero} alt={v.vendorName} className="w-full h-36 object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-36 bg-gradient-to-br from-gray-100 to-gray-200" />
              )}
              <div className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-lg font-bold text-gray-900 truncate">{v.vendorName}</div>
                    <div className="text-sm text-gray-500">Booth {v.boothName}</div>
                  </div>
                  <div className="w-11 h-11 rounded-full bg-yellow-500 text-black flex items-center justify-center font-semibold">
                    →
                  </div>
                </div>
                {v.description ? (
                  <div className="mt-2 text-sm text-gray-600 line-clamp-2">{v.description}</div>
                ) : null}
              </div>
            </button>
          ))}

          {vendors.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-md p-5 text-gray-600">
              No vendors found.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default VendorsPage;

