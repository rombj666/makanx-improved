import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { toast } from 'react-hot-toast';
import { Loader2, Plus, Edit2, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
  optionGroups?: any[];
  remarksEnabled?: boolean;
  displayOrder?: number;
}

type OptionChoice = { id: string; label: string; priceDelta?: number };
type OptionGroup = {
  id: string;
  title: string;
  type: 'single' | 'multi';
  required: boolean;
  choices: OptionChoice[];
};

function normalizeOptionGroups(groups: OptionGroup[]) {
  return groups
    .map((g) => {
      const title = String(g.title || '').trim();
      const choices = (Array.isArray(g.choices) ? g.choices : [])
        .map((c) => ({ ...c, label: String(c.label || '').trim() }))
        .filter((c) => c.label !== '');
      return { ...g, title, choices };
    })
    .filter((g) => g.title !== '' && Array.isArray(g.choices) && g.choices.length > 0);
}

function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID();
  }
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function VendorMenu() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    description: '',
    imageUrl: '',
    remarksEnabled: true as boolean,
  });
  const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchMenu = async () => {
    try {
      const { data } = await api.get('/menu-items');

      if (data.success) {
        const normalized = (Array.isArray(data.data) ? data.data : []).map((it: any, idx: number) => ({
          ...it,
          displayOrder: typeof it?.displayOrder === 'number' ? it.displayOrder : idx + 1,
        }));
        normalized.sort((a: any, b: any) => Number(a.displayOrder) - Number(b.displayOrder));
        setMenuItems(normalized);
      }
    } catch (error) {
      toast.error('Failed to load menu');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMenu();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
    let imageUrl = formData.imageUrl;

    if (selectedFile) {
      const form = new FormData();
      form.append("file", selectedFile);

      const uploadRes = await api.post(
        "/uploads/image?type=menuItem",
        form,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      if (uploadRes.data.success) {
        imageUrl = uploadRes.data.data.url;
      }
    }

    const payload = {
      name: formData.name,
      price: parseFloat(formData.price),
      description: formData.description,
      imageUrl,
      isAvailable: true,
      remarksEnabled: formData.remarksEnabled,
      optionGroups: normalizeOptionGroups(optionGroups),
    };

      if (editingItem) {
        await api.put(`/menu-items/${editingItem.id}`, payload);
        toast.success('Item updated');
      } else {
        await api.post('/menu-items', payload);
        toast.success('Item added');
      }
      
      setIsModalOpen(false);
      setEditingItem(null);
      setFormData({ name: '', price: '', description: '', imageUrl: '', remarksEnabled: true });
      setOptionGroups([]);
      setSelectedFile(null);
      fetchMenu();
    } catch (error) {
      const msg =
        (error as any)?.response?.data?.message ||
        (error as any)?.response?.data?.error ||
        'Operation failed';
      toast.error(msg);
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setFormData({ name: '', price: '', description: '', imageUrl: '', remarksEnabled: true });
    setOptionGroups([]);
    setIsModalOpen(true);
  };

  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      price: item.price.toString(),
      description: item.description || '',
      imageUrl: item.imageUrl || '',
      remarksEnabled: item.remarksEnabled !== false,
    });
    setOptionGroups(Array.isArray(item.optionGroups) ? (item.optionGroups as any) : []);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    try {
      await api.delete(`/menu-items/${id}`);
      toast.success('Item deleted');
      fetchMenu();
    } catch (error) {
      const msg =
        (error as any)?.response?.data?.message ||
        (error as any)?.response?.data?.error ||
        'Delete failed';
      toast.error(msg);
    }
  };

  const moveItem = async (itemId: string, direction: -1 | 1) => {
    const sorted = [...menuItems].sort((a: any, b: any) => Number(a.displayOrder) - Number(b.displayOrder));
    const fromIndex = sorted.findIndex((x) => x.id === itemId);
    const toIndex = fromIndex + direction;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= sorted.length) return;

    const a = sorted[fromIndex];
    const b = sorted[toIndex];
    const aOrder = typeof a.displayOrder === 'number' ? a.displayOrder : fromIndex + 1;
    const bOrder = typeof b.displayOrder === 'number' ? b.displayOrder : toIndex + 1;

    const optimistic = menuItems.map((it) => {
      if (it.id === a.id) return { ...it, displayOrder: bOrder };
      if (it.id === b.id) return { ...it, displayOrder: aOrder };
      return it;
    });
    optimistic.sort((x: any, y: any) => Number(x.displayOrder) - Number(y.displayOrder));
    setMenuItems(optimistic);

    try {
      await Promise.all([
        api.put(`/menu-items/${a.id}`, { displayOrder: bOrder }),
        api.put(`/menu-items/${b.id}`, { displayOrder: aOrder }),
      ]);
      fetchMenu();
    } catch (error) {
      const msg =
        (error as any)?.response?.data?.message ||
        (error as any)?.response?.data?.error ||
        'Reorder failed';
      toast.error(msg);
      fetchMenu();
    }
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  const sortedMenu = [...menuItems].sort((a: any, b: any) => Number(a.displayOrder) - Number(b.displayOrder));

  return (
    <>
      <div className="block [@media(pointer:coarse)]:hidden max-w-md mx-auto md:max-w-2xl p-4 space-y-4 pb-24">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My Menu</h1>
          <Button onClick={openAddModal} className="bg-orange-600 hover:bg-orange-700">
            <Plus size={18} className="mr-2" /> Add Item
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {sortedMenu.map((item, index) => (
            <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-4">
              {item.imageUrl && (
                <img src={item.imageUrl} alt={item.name} className="w-20 h-20 object-cover rounded-lg bg-gray-100" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-gray-900 truncate">{item.name}</h3>
                  <div className="flex gap-1 items-center">
                    <button
                      onClick={() => moveItem(item.id, -1)}
                      disabled={index === 0}
                      className="p-1 text-gray-400 hover:text-black disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      onClick={() => moveItem(item.id, 1)}
                      disabled={index === sortedMenu.length - 1}
                      className="p-1 text-gray-400 hover:text-black disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button onClick={() => openEditModal(item)} className="p-1 text-gray-400 hover:text-blue-600"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(item.id)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                  </div>
                </div>
                <p className="text-sm text-gray-500 line-clamp-2">{item.description}</p>
                <div className="mt-2 font-bold text-orange-600">${item.price.toFixed(2)}</div>
                <div className="mt-1 text-xs text-gray-500">
                  {(Array.isArray(item.optionGroups) && item.optionGroups.length > 0) ? `${item.optionGroups.length} groups` : 'No customizations'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="hidden [@media(pointer:coarse)]:block min-h-[100dvh] bg-neutral-50 px-4 pt-5 pb-28">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Vendor</div>
            <div className="text-2xl font-semibold text-black">Menu</div>
          </div>
          <button
            onClick={openAddModal}
            className="shrink-0 h-11 px-4 rounded-2xl bg-white border border-neutral-200 text-black font-semibold text-sm active:scale-[0.99] transition"
          >
            <span className="inline-flex items-center gap-2">
              <Plus size={18} />
              Add
            </span>
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 [@media(orientation:landscape)]:grid-cols-2">
          {sortedMenu.map((item, index) => {
            const groupsCount = Array.isArray(item.optionGroups) ? item.optionGroups.length : 0;
            return (
              <div key={item.id} className="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden">
                <div className="w-full aspect-[16/9] bg-neutral-100">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-neutral-100 to-neutral-200" />
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-black truncate">{item.name}</div>
                      <div className="mt-1 text-sm font-semibold text-neutral-700">${item.price.toFixed(2)}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {groupsCount > 0 ? `${groupsCount} groups` : 'No customizations'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center">
                        <button
                          onClick={() => moveItem(item.id, -1)}
                          disabled={index === 0}
                          className="w-10 h-10 rounded-2xl border border-neutral-200 bg-white text-black flex items-center justify-center active:scale-95 transition disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <ArrowUp size={18} />
                        </button>
                        <button
                          onClick={() => moveItem(item.id, 1)}
                          disabled={index === sortedMenu.length - 1}
                          className="ml-2 w-10 h-10 rounded-2xl border border-neutral-200 bg-white text-black flex items-center justify-center active:scale-95 transition disabled:opacity-30"
                          aria-label="Move down"
                        >
                          <ArrowDown size={18} />
                        </button>
                      </div>
                      <button
                        onClick={() => openEditModal(item)}
                        className="w-10 h-10 rounded-2xl border border-neutral-200 bg-white text-black flex items-center justify-center active:scale-95 transition"
                        aria-label="Edit item"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="w-10 h-10 rounded-2xl border border-neutral-200 bg-white text-black flex items-center justify-center active:scale-95 transition"
                        aria-label="Delete item"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {item.description ? (
                    <div className="mt-3 text-sm text-neutral-600 line-clamp-2">{item.description}</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="fixed bottom-4 left-4 right-4 z-40">
          <button
            onClick={openAddModal}
            className="w-full h-14 rounded-3xl bg-black text-white font-semibold shadow-2xl active:scale-[0.99] transition"
          >
            Add Item
          </button>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? 'Edit Item' : 'Add New Item'}
        mobileFullScreen
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <Input 
              required 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})} 
              placeholder="e.g. Nasi Lemak"
            />
          </div>
          <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700">
                Or Upload From Device
              </label>

              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0]);
                  }
                }}
                className="mt-1 block w-full text-sm border border-gray-300 rounded-md p-2"
              />

              {selectedFile && (
                <p className="text-xs text-green-600 mt-1">
                  Selected: {selectedFile.name}
                </p>
              )}
            </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Price ($)</label>
            <Input 
              required 
              type="number" 
              step="0.01" 
              min="0"
              value={formData.price} 
              onChange={e => setFormData({...formData, price: e.target.value})} 
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea 
              className="w-full rounded-md border border-gray-300 p-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent [@media(pointer:coarse)]:rounded-2xl [@media(pointer:coarse)]:border-neutral-200 [@media(pointer:coarse)]:focus:ring-black/20 [@media(pointer:coarse)]:focus:border-neutral-300"
              rows={3}
              value={formData.description} 
              onChange={e => setFormData({...formData, description: e.target.value})} 
              placeholder="Ingredients, details..."
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.remarksEnabled}
              onChange={(e) => setFormData({ ...formData, remarksEnabled: e.target.checked })}
            />
            <div className="text-sm text-gray-700">Allow typed remarks (customer note box)</div>
          </div>
          <div className="text-xs text-gray-500 -mt-2">
            Controls the free-text remarks field customers can type when ordering.
          </div>

          <div className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">Customization Groups</div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setOptionGroups((prev) =>
                    prev.concat({
                      id: newId(),
                      title: '',
                      type: 'single',
                      required: true,
                      choices: [{ id: newId(), label: '' }],
                    })
                  )
                }
              >
                <Plus size={16} className="mr-2" />
                Add Group
              </Button>
            </div>

            <div className="mt-3 space-y-3">
              {optionGroups.map((g, gi) => (
                <div key={g.id} className="rounded-lg border border-gray-200 p-3 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <label className="block text-xs font-semibold text-gray-500">Group Name</label>
                      <Input
                        value={g.title}
                        onChange={(e) => {
                          const v = e.target.value;
                          setOptionGroups((prev) =>
                            prev.map((x, i) => (i === gi ? { ...x, title: v } : x))
                          );
                        }}
                        placeholder="e.g. Temperature"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setOptionGroups((prev) => prev.filter((x) => x.id !== g.id))}
                      className="p-2 text-gray-400 hover:text-red-600"
                      aria-label="Remove group"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500">Type</label>
                      <select
                        value={g.type}
                        onChange={(e) => {
                          const v = e.target.value as 'single' | 'multi';
                          setOptionGroups((prev) =>
                            prev.map((x, i) => (i === gi ? { ...x, type: v } : x))
                          );
                        }}
                        className="w-full rounded-md border border-gray-300 p-2 text-sm"
                      >
                        <option value="single">Single choice</option>
                        <option value="multi">Multiple choice</option>
                      </select>
                    </div>
                    <div className="flex items-end gap-2">
                      <input
                        type="checkbox"
                        checked={g.required}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setOptionGroups((prev) =>
                            prev.map((x, i) => (i === gi ? { ...x, required: v } : x))
                          );
                        }}
                      />
                      <div className="text-sm text-gray-700">Required</div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold text-gray-500">Choices</div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setOptionGroups((prev) =>
                            prev.map((x, i) =>
                              i === gi
                                ? { ...x, choices: x.choices.concat({ id: newId(), label: '' }) }
                                : x
                            )
                          )
                        }
                      >
                        <Plus size={14} className="mr-2" />
                        Add Choice
                      </Button>
                    </div>

                    <div className="mt-2 space-y-2">
                      {g.choices.map((c, ci) => (
                        <div key={c.id} className="flex items-center gap-2">
                          <Input
                            value={c.label}
                            onChange={(e) => {
                              const v = e.target.value;
                              setOptionGroups((prev) =>
                                prev.map((x, i) =>
                                  i === gi
                                    ? {
                                        ...x,
                                        choices: x.choices.map((y, j) =>
                                          j === ci ? { ...y, label: v } : y
                                        ),
                                      }
                                    : x
                                )
                              );
                            }}
                            placeholder="e.g. Hot"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setOptionGroups((prev) =>
                                prev.map((x, i) =>
                                  i === gi
                                    ? { ...x, choices: x.choices.filter((y) => y.id !== c.id) }
                                    : x
                                )
                              )
                            }
                            className="p-2 text-gray-400 hover:text-red-600"
                            aria-label="Remove choice"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Image URL (Optional)</label>
            <Input 
              value={formData.imageUrl} 
              onChange={e => setFormData({...formData, imageUrl: e.target.value})} 
              placeholder="https://..."
            />
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" className="bg-orange-600 hover:bg-orange-700 [@media(pointer:coarse)]:bg-black [@media(pointer:coarse)]:hover:bg-black">
              {editingItem ? 'Save Changes' : 'Create Item'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
