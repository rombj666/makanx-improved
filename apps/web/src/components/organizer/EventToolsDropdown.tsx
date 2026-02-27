import { useState, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

interface Props {
  event: {
    id: string;
    name: string;
    slug: string;
  };
}

export function EventToolsDropdown({ event }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const qrRef = useRef<HTMLDivElement | null>(null);

  const url = `${window.location.origin}/customer/${event.slug}`;

  const handleToggleDropdown = () => {
    setIsOpen((prev) => !prev);
  };

  const handleOpenQr = () => {
    setIsQrModalOpen(true);
    setIsOpen(false);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch (error) {
      console.error(error);
    }
  };

  const handleDownloadQr = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;
    const dataUrl = (canvas as HTMLCanvasElement).toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `event-${event.slug}-qr.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPoster = () => {
    alert('Poster download coming soon');
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="whitespace-nowrap"
        onClick={handleToggleDropdown}
      >
        Event Tools ▼
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-40 bg-white border rounded-md shadow-lg z-20 py-1">
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
            onClick={handleOpenQr}
          >
            QR Code
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
            onClick={handleCopyLink}
          >
            Public Link
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
            onClick={handleDownloadPoster}
          >
            Download Poster
          </button>
        </div>
      )}

      <Modal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        title="Event QR Code"
      >
        <div className="flex flex-col items-center gap-4">
          <div ref={qrRef} className="bg-white p-4 rounded-lg border">
          <QRCodeCanvas
            value={url}
            size={256}
            includeMargin
          />        
            </div>
          <div className="w-full">
            <p className="text-sm text-gray-600 mb-1">Public URL</p>
            <div className="text-xs break-all px-2 py-1 bg-gray-100 rounded border">
              {url}
            </div>
          </div>
          <div className="flex gap-2 justify-end w-full">
            <Button variant="outline" size="sm" onClick={handleCopyLink}>
              Copy Link
            </Button>
            <Button size="sm" onClick={handleDownloadQr}>
              Download QR
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
