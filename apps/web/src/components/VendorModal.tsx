import { useState } from 'react';
import { Button } from './ui/Button';
import { api } from '../lib/api';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

export function VendorModal({ booth, onClose }: { booth: any; onClose: () => void }) {
  const navigate = useNavigate();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'PAY_AT_BOOTH' | 'MOCK_PAID'>('PAY_AT_BOOTH');
  
  if (!booth) return null;
  const vendor = booth.vendor;

  const addToCart = (item: any) => {
    setCart(prev => {
      const existing = prev.find(i => i.menuItemId === item.id);
      if (existing) {
        return prev.map(i => i.menuItemId === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: Number(item.price), quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
     setCart(prev => prev.filter(i => i.menuItemId !== itemId));
  };

  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsSubmitting(true);
    try {
      await api.post('/orders', {
        vendorId: vendor.id,
        items: cart.map(i => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
        paymentMode
      });
      toast.success('Order placed successfully!');
      onClose();
      navigate('/customer/orders'); // Redirect to tracking page
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to place order');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden flex max-h-[90vh]" onClick={e => e.stopPropagation()}>
        
        {/* Menu Section */}
        <div className="flex-1 p-6 overflow-y-auto border-r">
          <div className="mb-4">
            <h2 className="text-xl font-bold">{booth.name}</h2>
            {vendor ? (
              <>
                <h3 className="text-lg font-semibold text-blue-600">{vendor.businessName}</h3>
                <p className="text-gray-600 text-sm mt-1">{vendor.description}</p>
              </>
            ) : (
              <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">Available</span>
            )}
          </div>

          {vendor && vendor.menuItems && vendor.menuItems.length > 0 ? (
            <div className="mt-4">
              <h4 className="font-medium mb-2">Menu</h4>
              <ul className="space-y-4">
                {vendor.menuItems.map((item: any) => (
                  <li key={item.id} className="flex justify-between items-center border-b pb-2">
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-sm text-gray-500">${item.price}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => addToCart(item)}>
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No menu items.</p>
          )}
        </div>

        {/* Cart Section */}
        <div className="w-80 bg-gray-50 p-6 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg">Your Order</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-3">
            {cart.length === 0 && <p className="text-sm text-gray-500 text-center mt-10">Cart is empty</p>}
            {cart.map(item => (
              <div key={item.menuItemId} className="flex justify-between items-center bg-white p-2 rounded shadow-sm">
                <div className="text-sm">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-gray-500">{item.quantity} x ${item.price}</div>
                </div>
                <button onClick={() => removeFromCart(item.menuItemId)} className="text-red-500 hover:text-red-700">✕</button>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t">
            <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Payment Mode</label>
                <div className="flex space-x-2">
                    <button
                        className={`flex-1 py-2 text-sm rounded border transition-colors ${paymentMode === 'PAY_AT_BOOTH' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                        onClick={() => setPaymentMode('PAY_AT_BOOTH')}
                    >
                        Pay at Booth
                    </button>
                    <button
                        className={`flex-1 py-2 text-sm rounded border transition-colors ${paymentMode === 'MOCK_PAID' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                        onClick={() => setPaymentMode('MOCK_PAID')}
                    >
                        Mock Pay
                    </button>
                </div>
            </div>

            <div className="flex justify-between font-bold mb-4">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <Button className="w-full" disabled={cart.length === 0} onClick={handleCheckout} isLoading={isSubmitting}>
              Checkout
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}
