import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useSocket } from '../../context/SocketContext';
// import { useAuth } from '../../context/AuthContext';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { toast } from 'react-hot-toast';



interface OrderItem {
  quantity: number;
  menuItem: {
    name: string;
  };
}

interface Order {
  id: string;
  status: string;
  totalAmount: string;
  customer?: {
    name?: string;
  } | null;
  items: OrderItem[];
  createdAt: string;
  vendorId: string;
}

const COLUMNS = ['PREPARING', 'READY', 'COMPLETED'] as const;
type Column = (typeof COLUMNS)[number];

type ProductionWindow = {
  windowStart: string;
  windowEnd: string;
  items: { productId: string; productName: string; totalQty: number }[];
};

export function VendorDashboard() {
  // const { user } = useAuth(); // Unused
  const { socket } = useSocket();
  const [orders, setOrders] = useState<Order[]>([]);
  const [viewMode, setViewMode] = useState<'kitchen' | 'fulfillment'>('kitchen');
  const [groupingEnabled, setGroupingEnabled] = useState(false);

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

  const getOrdersByStatus = (status: string) => {
    return orders.filter(o => o.status === status);
  };

  const [productionBatch, setProductionBatch] = useState<ProductionWindow[]>([]);

  const fetchProductionBatch = async () => {
    if (!groupingEnabled) return;
    try {
      const { data } = await api.get('/orders/vendor/production-batch');
      if (data.success) {
        setProductionBatch(data.data || []);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const KitchenQueueView = ({
    groupingEnabled,
    setGroupingEnabled,
    productionWindows,
    onRefreshBatch,
  }: {
    groupingEnabled: boolean;
    setGroupingEnabled: Dispatch<SetStateAction<boolean>>;
    productionWindows: ProductionWindow[];
    onRefreshBatch: () => void;
  }) => {
    useEffect(() => {
      if (!groupingEnabled) return;
      onRefreshBatch();
      const interval = setInterval(() => {
        onRefreshBatch();
      }, 10000);
      return () => clearInterval(interval);
    }, [groupingEnabled, onRefreshBatch]);

    return (
      <div className="flex-1 overflow-x-auto">
        <div className="flex justify-between items-center mb-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="rounded border-gray-300"
              checked={groupingEnabled}
              onChange={(e) => setGroupingEnabled(e.target.checked)}
            />
            Group production by 5-min windows
          </label>
        </div>

        {!groupingEnabled && (
          <div className="mb-4 rounded-lg border bg-white p-4 text-sm text-gray-500">
            Enable grouping to view production queue.
          </div>
        )}

        {/* Block A (Grouped Windows Panel) START: was L194, ends L224 */}
        {groupingEnabled && (
          <>
            {productionWindows.length === 0 ? (
              <div className="mb-4 rounded-lg border bg-white p-4 text-sm text-gray-500">
                No unfinished orders in any window.
              </div>
            ) : (
              productionWindows.map((win) => {
                const start = new Date(win.windowStart);
                const end = new Date(win.windowEnd);
                const fmt = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={win.windowStart} className="rounded-lg border bg-white p-4 mb-4">
                    <div className="text-sm font-semibold mb-2">
                      {fmt(start)} – {fmt(end)}
                    </div>
                    <ul className="text-sm space-y-1">
                      {win.items.map((item) => (
                        <li key={item.productId} className="flex justify-between">
                          <span>{item.productName}</span>
                          <span className="font-semibold">{item.totalQty} cups</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </>
        )}
        {/* Block A (Grouped Windows Panel) END: was L194, ends L224 */}
      </div>
    );
  };

  const FulfillmentBoardView = ({
    orders,
    COLUMNS,
    getOrdersByStatus,
  }: {
    orders: Order[];
    COLUMNS: readonly Column[];
    getOrdersByStatus: (status: string) => Order[];
  }) => {
    void orders;
    return (
      <div className="flex-1 overflow-x-auto">
        {/* Block B (3 Columns Board) START: was L225, ends L264 */}
        <div className="flex gap-4 h-full min-w-[1000px]">
          {COLUMNS.map((status) => (
            <div key={status} className="flex-1 bg-gray-50 rounded-lg p-4 flex flex-col">
              <h3 className="font-bold text-lg mb-4 text-center sticky top-0 bg-gray-50 pb-2 border-b">
                {status} ({getOrdersByStatus(status).length})
              </h3>
              <div className="flex-1 overflow-y-auto space-y-4">
                {getOrdersByStatus(status).map((order) => (
                  <Card key={order.id} className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold">#{order.id.slice(-4)}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(order.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm font-medium mb-2">{order.customer?.name ?? 'Guest'}</p>
                      <ul className="text-sm space-y-1 mb-3">
                        {order.items.map((item, idx) => (
                          <li key={idx} className="flex justify-between">
                            <span>
                              {item.quantity}x {item.menuItem.name}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* Block B (3 Columns Board) END: was L225, ends L264 */}
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 h-[calc(100vh-64px)] flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Live Orders</h1>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-md border bg-white overflow-hidden">
            <Button
              variant={viewMode === 'kitchen' ? 'default' : 'outline'}
              className={viewMode === 'kitchen' ? 'bg-orange-500 text-white' : 'bg-white'}
              onClick={() => setViewMode('kitchen')}
            >
              Kitchen View
            </Button>
            <Button
              variant={viewMode === 'fulfillment' ? 'default' : 'outline'}
              className={viewMode === 'fulfillment' ? 'bg-gray-200' : 'bg-white'}
              onClick={() => setViewMode('fulfillment')}
            >
              Order Fulfillment
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              fetchOrders();
              if (groupingEnabled) fetchProductionBatch();
            }}
          >
            Refresh
          </Button>
        </div>
      </div>
      {viewMode === "kitchen" && (
        <KitchenQueueView
          groupingEnabled={groupingEnabled}
          setGroupingEnabled={setGroupingEnabled}
          productionWindows={productionBatch}
          onRefreshBatch={fetchProductionBatch}
        />
      )}

      {viewMode === "fulfillment" && (
        <FulfillmentBoardView orders={orders} COLUMNS={COLUMNS} getOrdersByStatus={getOrdersByStatus} />
      )}
    </div>
  );
}
