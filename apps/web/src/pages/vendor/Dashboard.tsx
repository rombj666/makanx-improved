import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useSocket } from '../../context/SocketContext';
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

export function VendorDashboard() {
  const { socket } = useSocket();
  const [orders, setOrders] = useState<Order[]>([]);
  const [viewMode, setViewMode] = useState<'kitchen' | 'fulfillment'>('kitchen');
  const [groupByWindow, setGroupByWindow] = useState(false);
  const [productionData, setProductionData] = useState<any[]>([]);

  useEffect(() => {
    fetchOrders();

    if (socket) {
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

  const fetchProductionBatch = async () => {
    try {
      console.log("Fetching production batch. Group:", groupByWindow);
      const res = await api.get(`/orders/vendor/production-batch?groupByWindow=${groupByWindow}`);
      if (res.data.success) {
        setProductionData(res.data.data);
      }
    } catch (err) {
      console.error("Production fetch error:", err);
    }
  };

  const GroupedProduction = ({ data }: { data: any[] }) => (
    <>
      {data.map((block: any) => (
        <div key={block.window}>
          <h4>{block.window}</h4>
          {block.items.map((item: any) => (
            <div key={item.name}>
              {item.name} — {item.quantity}
            </div>
          ))}
        </div>
      ))}
    </>
  );

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
      </div>
    );
  };

  useEffect(() => {
    fetchProductionBatch();
  }, [groupByWindow]);

  const SingleOrderList = ({ data }: { data: any[] }) => (
    <>
      {data.map((order: any) => (
        <div key={order.id}>
          Order #{order.orderNumber}
        </div>
      ))}
    </>
  );

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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="rounded border-gray-300"
              checked={groupByWindow}
              onChange={(e) => setGroupByWindow(e.target.checked)}
            />
            Group by 5-min window
          </label>
          <Button
            variant="outline"
            onClick={() => {
              fetchOrders();
              fetchProductionBatch();
            }}
          >
            Refresh
          </Button>
        </div>
      </div>
      {viewMode === "kitchen" && (
        <div className="mt-4">
          {groupByWindow && productionData?.length === 0 && (
            <p>No grouped production data.</p>
          )}
          {!groupByWindow && productionData?.length === 0 && (
            <p>No live orders.</p>
          )}
          {groupByWindow && (
            <GroupedProduction data={productionData} />
          )}
          {!groupByWindow && (
            <SingleOrderList data={productionData} />
          )}
        </div>
      )}

      {viewMode === "fulfillment" && (
        <FulfillmentBoardView orders={orders} COLUMNS={COLUMNS} getOrdersByStatus={getOrdersByStatus} />
      )}
    </div>
  );
}
