import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import BoothHeader from '../../components/customer/BoothHeader';
import MenuCard from '../../components/customer/MenuCard';
import CartBar from '../../components/customer/CartBar';
import { useCustomerCart } from '../../hooks/useCustomerCart';
import { toast } from 'react-hot-toast';
import { ProductDetailSheet } from '../../components/customer/ProductDetailSheet';

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl: string;
  optionGroups?: any[];
  remarksEnabled?: boolean;
}

interface Booth {
  id: string;
  name: string;
  vendor?: {
    id: string;
    businessName: string;
    menuItems?: MenuItem[];
  };
}

export function CustomerBoothOrderPage() {
  const { slug, boothId } = useParams();
  const navigate = useNavigate();
  const [booth, setBooth] = useState<Booth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!slug || !boothId) return;
      try {
        const { data } = await api.get(`/events/${slug}`);
        if (data.success) {
          const event = data.data;
          const found = (event.booths || []).find((b: any) => b.id === boothId) || null;
          setBooth(found);
          if (found && !found.vendor?.id) {
            setError('This booth is not available for ordering.');
          } else {
            setError(null);
          }
        }
      } catch (e: any) {
        setError('Failed to load booth menu');
      }
    };
    run();
  }, [boothId, slug]);

  const vendorId = booth?.vendor?.id || '';

  const menu: MenuItem[] = useMemo(() => {
    if (!booth?.vendor?.menuItems) return [];
    return booth.vendor.menuItems.map((m: any) => ({
      ...m,
      price: Number(m.price),
      imageUrl: m.imageUrl || '',
    }));
  }, [booth]);

  const cart = useCustomerCart({
    eventSlug: String(slug || ''),
    vendorId,
    vendorName: booth?.vendor?.businessName || booth?.name || '',
    boothName: booth?.name || '',
  });

  if (!booth) {
    return (
      <div className="w-full h-full bg-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Loading...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-neutral-50 flex flex-col">
      <BoothHeader
        boothName={booth.name}
        boothNumber={booth.name}
        vendorName={booth.vendor?.businessName || null}
        description={null}
        heroImageUrl={null}
        prepTimeMinutes={5}
        onBack={() => navigate(`/customer/event/${slug}`)}
      />

      <div className="flex-1 overflow-y-auto p-4 pb-28">
        {error ? (
          <div className="bg-white rounded-2xl shadow-md p-5 text-gray-700">
            {error}
          </div>
        ) : menu.length === 0 ? (
          <p className="text-gray-500">No menu items.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {menu.map((item) => (
              <MenuCard
                key={item.id}
                name={item.name}
                price={item.price}
                image={item.imageUrl}
                onClick={() => setActiveItem(item)}
              />
            ))}
          </div>
        )}
      </div>

      <CartBar
        totalItems={cart.totalItems}
        totalPrice={cart.total}
        onViewCart={() => navigate(`/customer/event/${slug}/order/${vendorId}/cart?boothId=${boothId}`)}
      />

      <ProductDetailSheet
        isOpen={!!activeItem}
        name={activeItem?.name || ''}
        price={Number(activeItem?.price || 0)}
        imageUrl={activeItem?.imageUrl || ''}
        optionGroups={Array.isArray(activeItem?.optionGroups) ? activeItem?.optionGroups : []}
        remarksEnabled={activeItem?.remarksEnabled !== false}
        onClose={() => setActiveItem(null)}
        onAdd={({ quantity, remark, selectedOptions }) => {
          if (!activeItem) return;
          cart.addLine({
            menuItemId: activeItem.id,
            name: activeItem.name,
            price: Number(activeItem.price),
            quantity,
            remark,
            imageUrl: activeItem.imageUrl || '',
            selectedOptions,
            remarksEnabled: activeItem?.remarksEnabled !== false,
          });
          toast.success('Added to cart');
        }}
      />
    </div>
  );
}
