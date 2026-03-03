import { useEffect, useState, useMemo } from 'react';
import { api } from '../../lib/api';
import { toast } from 'react-hot-toast';
import { Loader2, ChevronDown, ChevronRight} from 'lucide-react';
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
  status: 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';
  totalAmount: number;
  createdAt: string;
  acceptedAt?: string | null;
  readyAt?: string | null;
  completedAt?: string | null;
  items: OrderItem[];
}

const ORDER_STATUSES = ['PREPARING', 'READY', 'COMPLETED'] as const;
type OrderStatus = typeof ORDER_STATUSES[number];

// Helpers
const formatMoney = (amount: number) => `RM${amount.toFixed(2)}`;

const Metric = ({ label, value, accent }: { label: string, value: string | number, accent?: string }) => (
  <div>
    <div className="text-sm text-gray-500 uppercase font-semibold">{label}</div>
    <div className={`text-3xl font-bold ${accent || 'text-zinc-800'}`}>{value}</div>
  </div>
);

export function VendorOrders() {
  const {socket, isConnected } = useSocket();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [openSection, setOpenSection] = useState<OrderStatus | null>('PREPARING');
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  // 3.4 Live waiting timer
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
    const groups: Record<string, Order[]> = { PREPARING: [], READY: [], COMPLETED: [] };
    orders.forEach(o => {
      if (groups[o.status]) groups[o.status].push(o);
    });
    return groups;
  }, [orders]);


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


  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

return (
  <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-white to-amber-50 py-10 px-4">
    <div className="max-w-3xl mx-auto space-y-8">

      {!isConnected && (
        <div className="bg-rose-600 text-white text-sm py-2 rounded-full shadow-md flex items-center justify-center gap-2 animate-pulse">
          <span className="w-2 h-2 bg-white rounded-full"></span>
          Realtime connection lost...
        </div>
      )}

      {/* Summary Card */}
      <div className="backdrop-blur-xl bg-white/70 border border-white/40 shadow-2xl rounded-3xl p-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
        <Metric label="Orders" value={stats.totalOrders} accent="text-zinc-800" />
        <Metric label="Revenue" value={formatMoney(stats.revenue)} accent="text-emerald-600" />
        <Metric
          label="Avg Wait"
          value={stats.avgWaitTimeMin !== null ? `${stats.avgWaitTimeMin}m` : '--'}
          accent={
            stats.avgWaitTimeMin !== null && stats.avgWaitTimeMin > 10
              ? 'text-rose-600'
              : stats.avgWaitTimeMin !== null && stats.avgWaitTimeMin > 5
              ? 'text-amber-600'
              : 'text-emerald-600'
          }
        />
      </div>

      {/* Bulk Actions Bar */}
      {selectedOrderIds.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 bg-gray-900 text-white p-3 rounded-lg shadow-xl z-50 flex items-center justify-between">
          <span className="text-sm font-medium ml-2">
            {selectedOrderIds.size} selected
          </span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleBulkUpdate('PREPARING')}>
              Prep
            </Button>
            <Button size="sm" onClick={() => handleBulkUpdate('READY')}>
              Ready
            </Button>
            <Button size="sm" onClick={() => handleBulkUpdate('COMPLETED')}>
              Done
            </Button>
          </div>
        </div>
      )}

      {/* Accordions */}
      <div className="space-y-2">
        {ORDER_STATUSES.map(status => {
          const sectionOrders = groupedOrders[status] || [];
          const isOpen = openSection === status;

          return (
            <div key={status} className="border rounded-lg overflow-hidden bg-white shadow-sm">
              <button
                onClick={() =>
                  setOpenSection(openSection === status ? null : status)
                }
                className="w-full flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <span className="font-bold">{status}</span>
                  <span className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                    {sectionOrders.length}
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="p-3 space-y-3 bg-gray-50/50 min-h-[100px]">
                  {sectionOrders.map(order => (
                    <div
                      key={order.id}
                      className="bg-white p-3 rounded-xl shadow-sm border border-gray-100"
                    >
                      <div className="flex justify-between mb-2">
                        <div>
                          #{order.id.slice(-4)}
                          <div>{formatMoney(order.totalAmount)}</div>
                        </div>
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
  </div>
);}