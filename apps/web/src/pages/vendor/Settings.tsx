import { useMemo, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Copy, Download, QrCode } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

export function VendorSettings() {
  const { user } = useAuth();
  const canvasWrap = useRef<HTMLDivElement>(null);
  const orderUrl = useMemo(() => {
    const vendorSlug = user?.vendorProfile?.slug || user?.vendorProfile?.id || '';
    return `${window.location.origin}/v/${encodeURIComponent(vendorSlug)}`;
  }, [user?.vendorProfile?.id, user?.vendorProfile?.slug]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(orderUrl);
    toast.success('Customer order link copied');
  };

  const downloadPng = () => {
    const canvas = canvasWrap.current?.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'customer-order-qr.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <main className="mx-auto w-full max-w-3xl overflow-x-hidden px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-950">Settings</h1>
      <section className="mt-6 min-w-0 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-neutral-100 p-3"><QrCode size={24} /></div>
          <div>
            <h2 className="text-lg font-bold">QR Code</h2>
            <p className="text-sm text-neutral-600">Customers scan this code to open your menu directly.</p>
          </div>
        </div>
        <div className="mt-6 grid min-w-0 gap-6 sm:grid-cols-[220px_1fr] sm:items-center">
          <div ref={canvasWrap} className="mx-auto rounded-2xl border bg-white p-4">
            <QRCodeCanvas value={orderUrl} size={184} level="H" marginSize={1} />
          </div>
          <div className="min-w-0">
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Customer order URL</label>
            <div className="mt-2 break-all rounded-2xl bg-neutral-100 p-3 text-sm text-neutral-800">{orderUrl}</div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button onClick={copyLink} className="flex h-11 items-center justify-center gap-2 rounded-xl border font-semibold"><Copy size={17} />Copy Link</button>
              <button onClick={downloadPng} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-black font-semibold text-white"><Download size={17} />Download QR PNG</button>
            </div>
            <p className="mt-3 text-xs text-neutral-500">PDF download was not present in the existing project, so QR export remains PNG.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
