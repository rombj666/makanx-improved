import { useEffect, useState, useMemo } from 'react';
import { api } from '../../lib/api';
import { toast } from 'react-hot-toast';
import { Loader2, ChevronDown, ChevronRight, CheckSquare, Square, Clock } from 'lucide-react';
import { Button } from '../../components/ui/Button';

import { useSocket } from '../../context/SocketContext';

// Types
interface OrderItem {
  id: string;
  quantity: number;
  menuItem: {
    name: string;
    price: number;
  };
}

interface Order {
  id: string;
  status: 'PENDING' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';
  totalAmount: number;
  createdAt: string;
  acceptedAt?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
  items: OrderItem[];
}

const ORDER_STATUSES = ['PENDING', 'PREPARING', 'READY', 'COMPLETED'] as const;
type OrderStatus = typeof ORDER_STATUSES[number];

// Helpers
const formatMoney = (amount: number) => `RM${amount.toFixed(2)}`;


export function VendorOrders() {
  const {socket, isConnected } = useSocket();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openSection, setOpenSection] = useState<OrderStatus | null>('PENDING');
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(new Date());

  // 3.4 Live waiting timer
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchOrders = async () => {
    try {
      const { data } = await api.get('/orders/vendor-orders');
      if (data.success) {
        setOrders(data.data);
      }
    } catch (error) {
      toast.error('Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // Poll every 30s to keep fresh
    const poll = setInterval(fetchOrders, 30000);
    return () => clearInterval(poll);
  }, []);
useEffect(() => {
  if (!socket) return;

  const handleNewOrder = () => {
    fetchOrders();
    toast.success("New order received!");
  };

  socket.on("order_created", handleNewOrder);

  return () => {
    socket.off("order_created", handleNewOrder);
  };
}, [socket]);

  // 3.3 Summary Stats
  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const revenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    
    const completedOrders = orders.filter(o => o.status === 'COMPLETED' && o.completedAt);
    const totalWaitTime = completedOrders.reduce((sum, o) => {
      const start = new Date(o.createdAt).getTime();
      const end = new Date(o.completedAt!).getTime();
      return sum + (end - start);
    }, 0);
    
    const avgWaitTimeMs = completedOrders.length > 0 ? totalWaitTime / completedOrders.length : 0;
    const avgWaitTimeMin = completedOrders.length > 0 ? Math.round(avgWaitTimeMs / 60000) : null;

    return { totalOrders, revenue, avgWaitTimeMin };
  }, [orders]);

  // Group orders
  const groupedOrders = useMemo(() => {
    const groups: Record<string, Order[]> = { PENDING: [], PREPARING: [], READY: [], COMPLETED: [] };
    orders.forEach(o => {
      if (groups[o.status]) groups[o.status].push(o);
    });
    return groups;
  }, [orders]);

  // Actions
  const handleStatusUpdate = async (orderId: string, status: OrderStatus) => {
    try {
      await api.put(`/orders/${orderId}/status`, { status });
      toast.success(`Order marked ${status}`);
      fetchOrders();
    } catch (error) {
      toast.error('Update failed');
    }
  };

  const handleBulkUpdate = async (status: OrderStatus) => {
    if (selectedOrderIds.size === 0) return;
    try {
      const { data } = await api.put('/orders/bulk-status', {
        orderIds: Array.from(selectedOrderIds),
        status
      });
      toast.success(`Updated ${data.updatedCount} orders to ${status}`);
      setSelectedOrderIds(new Set());
      fetchOrders();
    } catch (error) {
      toast.error('Bulk update failed');
    }
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedOrderIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedOrderIds(next);
  };

  const formatWaitTime = (createdAt: string) => {
    const diff = now.getTime() - new Date(createdAt).getTime();
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}m ${secs}s`;
  };

  const getTimerBadgeColors = (createdAt: string) => {
    const diff = now.getTime() - new Date(createdAt).getTime();
    const mins = Math.floor(diff / 60000);
    
    if (mins < 5) {
      return 'bg-green-50 text-green-600 border border-green-100';
    } else if (mins <= 10) {
      return 'bg-orange-50 text-orange-600 border border-orange-100';
    } else {
      return 'bg-red-50 text-red-600 border border-red-100';
    }
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="max-w-md mx-auto md:max-w-2xl p-4 space-y-4 pb-24">
        {!isConnected && (
          <div className="bg-red-600 text-white text-sm py-2 rounded-md shadow flex items-center justify-center gap-2 animate-pulse">
            <span className="w-2 h-2 bg-white rounded-full"></span>
            Realtime connection lost. Reconnecting...
          </div>
        )}
      {/* Summary Card */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xs text-gray-500 uppercase font-bold">Orders</div>
          <div className="text-xl font-bold text-gray-900">{stats.totalOrders}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase font-bold">Revenue</div>
          <div className="text-xl font-bold text-green-600">{formatMoney(stats.revenue)}</div>
        </div>
        <div>
            <div className="text-xs text-gray-500 uppercase font-bold">Avg Wait</div>
           <div className={`text-xl font-bold ${
              stats.avgWaitTimeMin !== null && stats.avgWaitTimeMin > 10
                ? 'text-red-600'
                : stats.avgWaitTimeMin !== null && stats.avgWaitTimeMin > 5
                ? 'text-orange-600'
                : 'text-green-600'
            }`}>
            {stats.avgWaitTimeMin !== null ? `${stats.avgWaitTimeMin}m` : '--'}</div>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedOrderIds.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 bg-gray-900 text-white p-3 rounded-lg shadow-xl z-50 flex items-center justify-between animate-in slide-in-from-bottom-2">
          <span className="text-sm font-medium ml-2">{selectedOrderIds.size} selected</span>
          <div className="flex gap-2">
             <Button size="sm" variant="outline" className="text-black bg-white hover:bg-gray-100 h-8 text-xs" onClick={() => handleBulkUpdate('PREPARING')}>Prep</Button>
             <Button size="sm" variant="outline" className="text-black bg-white hover:bg-gray-100 h-8 text-xs" onClick={() => handleBulkUpdate('READY')}>Ready</Button>
             <Button size="sm" variant="outline" className="text-black bg-white hover:bg-gray-100 h-8 text-xs" onClick={() => handleBulkUpdate('COMPLETED')}>Done</Button>
          </div>
        </div>
      )}

      {/* Accordions */}
      <div className="space-y-2">
        {ORDER_STATUSES.map(status => {
          const sectionOrders = groupedOrders[status] || [];
          const isOpen = openSection === status;
          
          // Status Colors
          const colorClass = 
            status === 'PENDING' ? 'border-l-yellow-500 text-yellow-700 bg-yellow-50' :
            status === 'PREPARING' ? 'border-l-orange-500 text-orange-700 bg-orange-50' :
            status === 'READY' ? 'border-l-green-500 text-green-700 bg-green-50' :
            status === 'COMPLETED' ? 'border-l-gray-500 text-gray-700 bg-gray-50' :
            'border-l-gray-500 text-gray-700 bg-gray-50';

          return (
            <div key={status} className="border rounded-lg overflow-hidden bg-white shadow-sm">
              <button 
                onClick={() => 
                  setOpenSection(openSection === status ? null : status)
                }
                className={`w-full flex items-center justify-between p-4 ${isOpen ? 'bg-gray-50' : 'bg-white'}`}
              >
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <span className={`font-bold ${
                      status === 'PENDING'
                        ? 'text-yellow-600'
                        : status === 'PREPARING'
                        ? 'text-orange-600'
                        : status === 'READY'
                        ? 'text-green-600'
                        : 'text-gray-700'
                    }`}>
                      {status}
                    </span>
                  <span className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                    {sectionOrders.length}
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="p-3 space-y-3 bg-gray-50/50 min-h-[100px]">
                  {sectionOrders.length === 0 && (
                    <div className="text-center text-gray-400 py-4 text-sm italic">No orders</div>
                  )}
                  {sectionOrders.map(order => (
                    <div key={order.id} className={`bg-white p-3 rounded-xl shadow-sm border border-gray-100 border-l-4 ${colorClass.split(' ')[0]} relative`}>
                       {/* Header */}
                       <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                             {status !== 'COMPLETED' && (
                               <button onClick={() => toggleSelection(order.id)} className="text-gray-400 hover:text-gray-600">
                                 {selectedOrderIds.has(order.id) ? <CheckSquare size={20} className="text-yellow-600" /> : <Square size={20} />}
                               </button>
                             )}
                             <div>
                               <div className="font-mono text-xs text-gray-500">#{order.id.slice(-4)}</div>
                               <div className="font-bold text-gray-900">{formatMoney(order.totalAmount)}</div>
                             </div>
                          </div>
                          
                          {status !== 'COMPLETED' && (
                            <div className={`flex items-center gap-1 px-2 py-1 rounded-md ${getTimerBadgeColors(order.createdAt)}`}>
                              <Clock size={12} />
                              <span className="text-xs font-mono font-medium">{formatWaitTime(order.createdAt)}</span>
                            </div>
                          )}
                       </div>

                       {/* Items */}
                       <div className="text-sm text-gray-600 mb-3 space-y-1">
                          {order.items.map(item => (
                            <div key={item.id} className="flex justify-between">
                               <span>{item.quantity}x {item.menuItem.name}</span>
                            </div>
                          ))}
                       </div>

                       {/* Action Button */}
                       <div className="flex justify-end">
                          {status === 'PENDING' && (
                            <Button size="sm" onClick={() => handleStatusUpdate(order.id, 'PREPARING')} className="w-full bg-yellow-600 hover:bg-yellow-700">Accept & Prepare</Button>
                          )}
                          {status === 'PREPARING' && (
                            <Button size="sm" onClick={() => handleStatusUpdate(order.id, 'READY')} className="w-full bg-orange-500 hover:bg-orange-600">Mark Ready</Button>
                          )}
                          {status === 'READY' && (
                            <Button size="sm" onClick={() => handleStatusUpdate(order.id, 'COMPLETED')} className="w-full bg-green-600 hover:bg-green-700">Complete</Button>
                          )}
                       </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}