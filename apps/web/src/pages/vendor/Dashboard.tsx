import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useSocket } from '../../context/SocketContext';
// import { useAuth } from '../../context/AuthContext';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { toast } from 'react-hot-toast';



interface Order {
  id: string;
  status: string;
  totalAmount: string;
  customer: {
    name: string;
  };
  items: {
    quantity: number;
    menuItem: {
      name: string;
    };
  }[];
  createdAt: string;
}

const COLUMNS = ['PENDING', 'PREPARING', 'READY', 'COMPLETED'];

export function VendorDashboard() {
  // const { user } = useAuth(); // Unused
  const { socket } = useSocket();
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    fetchOrders();

    if (socket) {
      // Socket logic...
      // Removed unused joinVendorRoom function and data destructuring to fix build errors.
      
      socket.on('order_created', (newOrder: Order) => {
        setOrders(prev => [newOrder, ...prev]);
        toast.success('New Order Received!');
      });

      socket.on('order_updated', (updatedOrder: Order) => {
        setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
      });
    }

    return () => {
      if (socket) {
        socket.off('order_created');
        socket.off('order_updated');
      }
    };
  }, [socket]);

  const fetchOrders = async () => {
    try {
      const { data } = await api.get('/orders/vendor-orders');
      if (data.success) {
        setOrders(data.data);
        
        // If we have orders, we know the vendorId
        if (data.data.length > 0 && socket) {
             const vid = data.data[0].vendorId;
             socket.emit('join_vendor', vid);
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  const updateStatus = async (orderId: string, status: string) => {
    try {
      const { data } = await api.patch(`/orders/${orderId}/status`, { status });
      if (data.success) {
        setOrders(prev => prev.map(o => o.id === orderId ? data.data : o));
        toast.success(`Order marked as ${status}`);
      }
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const getOrdersByStatus = (status: string) => {
    return orders.filter(o => o.status === status);
  };

  return (
    <div className="container mx-auto p-6 h-[calc(100vh-64px)] flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Live Orders</h1>
        <div>
           <Button variant="outline" onClick={fetchOrders}>Refresh</Button>
        </div>
      </div>
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 h-full min-w-[1000px]">
          {COLUMNS.map(status => (
            <div key={status} className="flex-1 bg-gray-50 rounded-lg p-4 flex flex-col">
              <h3 className="font-bold text-lg mb-4 text-center sticky top-0 bg-gray-50 pb-2 border-b">
                {status} ({getOrdersByStatus(status).length})
              </h3>
              <div className="flex-1 overflow-y-auto space-y-4">
                {getOrdersByStatus(status).map(order => (
                  <Card key={order.id} className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold">#{order.id.slice(-4)}</span>
                        <span className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-sm font-medium mb-2">{order.customer.name}</p>
                      <ul className="text-sm space-y-1 mb-3">
                        {order.items.map((item, idx) => (
                          <li key={idx} className="flex justify-between">
                            <span>{item.quantity}x {item.menuItem.name}</span>
                          </li>
                        ))}
                      </ul>
                      
                      <div className="flex flex-col gap-2 mt-2">
                        {status === 'PENDING' && (
                          <Button size="sm" onClick={() => updateStatus(order.id, 'PREPARING')}>Accept</Button>
                        )}
                        {status === 'PREPARING' && (
                          <Button size="sm" onClick={() => updateStatus(order.id, 'READY')}>Mark Ready</Button>
                        )}
                        {status === 'READY' && (
                          <Button size="sm" onClick={() => updateStatus(order.id, 'COMPLETED')}>Complete</Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
