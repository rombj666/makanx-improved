import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useSocket } from '../../context/SocketContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { toast } from 'react-hot-toast';

interface Order {
  id: string;
  status: string;
  totalAmount: string;
  completedAt?: string | null;
  vendor: {
    businessName: string;
  };
  items: {
    quantity: number;
    menuItem: {
      name: string;
      price: string;
    };
  }[];
  createdAt: string;
}

export function CustomerOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const { socket } = useSocket();

  useEffect(() => {
    fetchOrders();

    if (socket) {
      socket.on('order_updated', (updatedOrder: Order) => {
        setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
        toast.success(`Order status updated: ${updatedOrder.status}`);
      });
    }

    return () => {
      if (socket) socket.off('order_updated');
    };
  }, [socket]);

  const fetchOrders = async () => {
    try {
      const { data } = await api.get('/orders/my-orders');
      if (data.success) {
        setOrders(data.data);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PREPARING': return 'text-blue-600 bg-blue-100';
      case 'READY': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">My Orders</h1>
      
      <div className="grid gap-6">
        {orders.length === 0 && <p>No orders yet.</p>}
        {orders.map(order => (
          <Card key={order.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-bold">{order.vendor.businessName}</CardTitle>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(order.status)}`}>
                {order.status}
              </span>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-gray-500 mb-2">
                Ordered on {new Date(order.createdAt).toLocaleString()}
              </div>
              <ul className="space-y-1 mb-4">
                {order.items.map((item, idx) => (
                  <li key={idx} className="flex justify-between text-sm">
                    <span>{item.quantity}x {item.menuItem.name}</span>
                    <span>${(Number(item.menuItem.price) * item.quantity).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between font-bold border-t pt-2">
                <span>Total</span>
                <span>${Number(order.totalAmount).toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
