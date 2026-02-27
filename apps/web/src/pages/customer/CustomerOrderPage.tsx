
import { useParams } from 'react-router-dom';

export function CustomerOrderPage() {
  const { vendorId } = useParams();

  return (
    <div className="w-full h-full bg-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Order Page</h1>
        <p className="text-gray-500">Vendor ID: {vendorId}</p>
      </div>
    </div>
  );
}
