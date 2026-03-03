import { useNavigate } from 'react-router-dom';

interface BoothInfoProps {
  booth: any;
  onClose?: () => void;
  onPlaceOrder?: () => void;
}

export function BoothInfo({ booth, onClose, onPlaceOrder }: BoothInfoProps) {
  const navigate = useNavigate();
  const handlePlaceOrder = () => {
    if (onPlaceOrder) {
      onPlaceOrder();
      return;
    }
    const vendorId = booth?.vendor?.id;
    if (vendorId) {
      navigate(`/customer/event/${booth?.eventSlug || ''}/order/${vendorId}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{booth?.name}</h2>
          <p className="text-sm font-medium text-orange-600">
            {booth?.vendor?.businessName || 'Available Booth'}
          </p>
        </div>
        <button onClick={onClose} className="p-2 text-gray-400">✕</button>
      </div>
      {booth?.vendor ? (
        <>
          <div className="pb-28">
            <p className="text-gray-600 text-sm">
              {booth?.vendor?.description || 'No description available.'}
            </p>
          </div>
          <div className="fixed bottom-4 left-4 right-4 z-50 md:hidden">
            <button
              onClick={handlePlaceOrder}
              className="w-full bg-black text-white py-4 rounded-xl text-lg font-semibold shadow-xl active:scale-95 transition"
            >
              Place Order
            </button>
          </div>
        </>
      ) : (
        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <p className="text-gray-500 text-sm">This booth is currently available.</p>
        </div>
      )}
    </div>
  );
}
