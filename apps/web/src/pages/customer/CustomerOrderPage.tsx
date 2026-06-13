import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '../../lib/api';
import { getOrCreateGuestId } from '../../lib/guest';
import { getOrCreateDeviceId } from '../../lib/deviceOrderLock';
import { useCustomerCart } from '../../hooks/useCustomerCart';

interface OptionChoice {
  id: string;
  label: string;
  priceDelta?: number;
}

interface OptionGroup {
  id: string;
  title: string;
  type: 'single' | 'multi';
  required: boolean;
  choices: OptionChoice[];
}

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  optionGroups?: OptionGroup[];
  remarksEnabled?: boolean;
}

interface Store {
  id: string;
  businessName: string;
  description?: string;
  settings?: {
    orderingOpen: boolean;
    showPrices: boolean;
    deviceOrderLimitEnabled: boolean;
    maxDrinksPerOrder: number;
  };
  menuItems: MenuItem[];
}

export function CustomerOrderPage() {
  const { vendorId = '' } = useParams();
  const navigate = useNavigate();
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [selectedChoices, setSelectedChoices] = useState<Record<string, string[]>>({});
  const [remark, setRemark] = useState('');

  const cart = useCustomerCart({
    storeId: vendorId,
    vendorId,
    vendorName: store?.businessName || '',
    maxItems: store?.settings?.deviceOrderLimitEnabled ? store.settings.maxDrinksPerOrder : 99,
  });

  useEffect(() => {
    api.get(`/menu-items/public/${vendorId}`)
      .then(({ data }) => setStore(data.data))
      .catch((error) => {
        console.error('[customer-menu] Failed to load store menu', error);
        toast.error('Store menu could not be loaded');
      })
      .finally(() => setLoading(false));
  }, [vendorId]);

  const menu = useMemo(() => store?.menuItems || [], [store]);
  const showPrices = store?.settings?.showPrices !== false;
  const activeGroups = useMemo(
    () => (Array.isArray(customizingItem?.optionGroups) ? customizingItem.optionGroups : []),
    [customizingItem],
  );
  const requiredSelectionsComplete = activeGroups.every(
    (group) => !group.required || (selectedChoices[group.id]?.length || 0) > 0,
  );
  const customizationPrice = useMemo(() => {
    return activeGroups.reduce((sum, group) => {
      const ids = selectedChoices[group.id] || [];
      return sum + group.choices
        .filter((choice) => ids.includes(choice.id))
        .reduce((choiceSum, choice) => choiceSum + Number(choice.priceDelta || 0), 0);
    }, 0);
  }, [activeGroups, selectedChoices]);

  const openItem = (item: MenuItem) => {
    const groups = Array.isArray(item.optionGroups) ? item.optionGroups : [];
    if (groups.length === 0 && item.remarksEnabled === false) {
      cart.addLine({
        menuItemId: item.id,
        name: item.name,
        price: Number(item.price),
        quantity: 1,
        remark: '',
        imageUrl: item.imageUrl || '',
        selectedOptions: [],
        remarksEnabled: false,
      });
      toast.success(`${item.name} added`);
      return;
    }
    setCustomizingItem(item);
    setSelectedChoices({});
    setRemark('');
  };

  const toggleChoice = (group: OptionGroup, choiceId: string) => {
    setSelectedChoices((current) => {
      const selected = current[group.id] || [];
      const next = group.type === 'multi'
        ? selected.includes(choiceId)
          ? selected.filter((id) => id !== choiceId)
          : [...selected, choiceId]
        : [choiceId];
      return { ...current, [group.id]: next };
    });
  };

  const addCustomizedItem = () => {
    if (!customizingItem) return;
    const missing = activeGroups.find(
      (group) => group.required && (selectedChoices[group.id]?.length || 0) === 0,
    );
    if (missing) {
      toast.error(`Please select ${missing.title}`);
      return;
    }

    const selectedOptions = activeGroups
      .map((group) => {
        const choiceIds = selectedChoices[group.id] || [];
        const choiceLabels = group.choices
          .filter((choice) => choiceIds.includes(choice.id))
          .map((choice) => choice.label);
        return { groupId: group.id, choiceIds, title: group.title, choiceLabels };
      })
      .filter((selection) => selection.choiceIds.length > 0);

    cart.addLine({
      menuItemId: customizingItem.id,
      name: customizingItem.name,
      price: Number(customizingItem.price) + customizationPrice,
      quantity: 1,
      remark: remark.trim(),
      imageUrl: customizingItem.imageUrl || '',
      selectedOptions,
      remarksEnabled: customizingItem.remarksEnabled,
    });
    toast.success(`${customizingItem.name} added`);
    setCustomizingItem(null);
  };

  const checkout = async () => {
    if (!store?.settings?.orderingOpen || cart.lines.length === 0) return;
    setPlacing(true);
    try {
      const { data } = await api.post('/orders', {
        vendorId,
        guestId: getOrCreateGuestId(),
        deviceId: getOrCreateDeviceId(),
        paymentMode: 'PAY_AT_COUNTER',
        items: cart.lines.map((line) => ({
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          remark: line.remark,
          selectedOptions: (line.selectedOptions || []).map((selection) => ({
            groupId: selection.groupId,
            choiceIds: selection.choiceIds,
          })),
        })),
      });
      cart.clear();
      toast.success(`Order #${data.data.order.displayNumber} placed`);
      navigate(`/track/${data.data.order.id}`);
    } catch (error: any) {
      console.error('[customer-order] Checkout failed', error);
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Checkout failed');
    } finally {
      setPlacing(false);
    }
  };

  if (loading) return <div className="p-10 text-center">Loading menu...</div>;
  if (!store) return <div className="p-10 text-center">Store not found.</div>;

  return (
    <main className="min-h-screen overflow-x-hidden bg-neutral-50 pb-52">
      <header className="border-b border-neutral-200 bg-white px-4 py-8 text-black">
        <div className="mx-auto max-w-4xl">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-600">Smart QR Ordering System</div>
          <h1 className="mt-2 text-3xl font-bold">{store.businessName}</h1>
          {store.description && <p className="mt-2 max-w-xl text-neutral-600">{store.description}</p>}
          {!store.settings?.orderingOpen && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">Ordering is currently closed.</p>}
        </div>
      </header>

      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 px-4 py-6 sm:grid-cols-2">
        {menu.map((item) => (
          <article key={item.id} className="min-w-0 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
            {item.imageUrl && <img src={item.imageUrl} alt="" className="h-40 w-full rounded-2xl object-cover" />}
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words font-bold">{item.name}</h2>
                {item.description && <p className="mt-1 text-sm text-neutral-600">{item.description}</p>}
                {(item.optionGroups?.length || 0) > 0 && (
                  <p className="mt-2 text-xs font-medium text-neutral-500">Customization available</p>
                )}
              </div>
              {showPrices && <span className="shrink-0 font-bold">RM{Number(item.price).toFixed(2)}</span>}
            </div>
            <button
              disabled={!store.settings?.orderingOpen}
              onClick={() => openItem(item)}
              className="mt-4 h-11 w-full rounded-xl bg-black font-semibold text-white disabled:bg-neutral-300"
            >
              Add to order
            </button>
          </article>
        ))}
      </div>

      {cart.totalItems > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white p-4 shadow-2xl">
          <div className="mx-auto max-w-4xl">
            <div className="max-h-48 space-y-3 overflow-y-auto">
              {cart.lines.map((line) => (
                <div key={line.id} className="flex min-w-0 items-start justify-between gap-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{line.name}</div>
                    {(line.selectedOptions || []).map((selection) => (
                      <div key={selection.groupId} className="truncate text-xs text-neutral-500">
                        {selection.title}: {(selection.choiceLabels || []).join(', ')}
                      </div>
                    ))}
                    {line.remark && <div className="truncate text-xs text-neutral-500">Note: {line.remark}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={() => cart.updateQuantity(line.id, line.quantity - 1)} className="h-8 w-8 rounded-lg border">{line.quantity === 1 ? <Trash2 className="m-auto" size={14} /> : <Minus className="m-auto" size={14} />}</button>
                    <span className="w-5 text-center">{line.quantity}</span>
                    <button onClick={() => cart.updateQuantity(line.id, line.quantity + 1)} className="h-8 w-8 rounded-lg border"><Plus className="m-auto" size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={checkout} disabled={placing} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-black font-bold text-white disabled:opacity-50">
              <ShoppingBag size={18} />
              {placing ? 'Placing order...' : showPrices ? `Checkout · RM${cart.total.toFixed(2)}` : 'Checkout'}
            </button>
          </div>
        </div>
      )}

      {customizingItem && (
        <div className="fixed inset-0 z-50 bg-black/60" onMouseDown={() => setCustomizingItem(null)}>
          <div
            className="absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-h-[85vh] sm:w-[min(92vw,560px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="break-words text-xl font-bold">{customizingItem.name}</h2>
                {customizingItem.description && <p className="mt-1 text-sm text-neutral-600">{customizingItem.description}</p>}
              </div>
              <button onClick={() => setCustomizingItem(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 space-y-5">
              {activeGroups.map((group) => (
                <fieldset key={group.id}>
                  <legend className="font-semibold">
                    {group.title}
                    {group.required && <span className="ml-1 text-red-600">*</span>}
                  </legend>
                  <p className="text-xs text-neutral-500">{group.type === 'multi' ? 'Select one or more' : 'Select one'}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {group.choices.map((choice) => {
                      const checked = (selectedChoices[group.id] || []).includes(choice.id);
                      return (
                        <label key={choice.id} className={`flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-2xl border p-3 ${checked ? 'border-black bg-neutral-100' : 'border-neutral-200'}`}>
                          <span className="flex min-w-0 items-center gap-3">
                            <input
                              type={group.type === 'multi' ? 'checkbox' : 'radio'}
                              name={`option-${group.id}`}
                              checked={checked}
                              onChange={() => toggleChoice(group, choice.id)}
                            />
                            <span className="break-words text-sm font-medium">{choice.label}</span>
                          </span>
                          {showPrices && Number(choice.priceDelta || 0) !== 0 && (
                            <span className="shrink-0 text-xs font-semibold">
                              +RM{Number(choice.priceDelta).toFixed(2)}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}

              {customizingItem.remarksEnabled !== false && (
                <label className="block">
                  <span className="font-semibold">Note</span>
                  <textarea
                    value={remark}
                    onChange={(event) => setRemark(event.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="Optional request"
                    className="mt-2 w-full resize-none rounded-2xl border border-neutral-200 p-3 text-sm outline-none focus:border-black"
                  />
                </label>
              )}
            </div>

            {!requiredSelectionsComplete && (
              <p className="mt-5 text-sm text-red-600">Select all required options to continue.</p>
            )}
            <button
              onClick={addCustomizedItem}
              disabled={!requiredSelectionsComplete}
              className="mt-4 h-12 w-full rounded-2xl bg-black font-bold text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {showPrices
                ? `Add to cart · RM${(Number(customizingItem.price) + customizationPrice).toFixed(2)}`
                : 'Add to cart'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
