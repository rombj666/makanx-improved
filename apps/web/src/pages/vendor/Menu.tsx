import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { toast } from 'react-hot-toast';
import { Loader2, Plus, Edit2, Trash2 } from 'lucide-react';
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
    imageUrl: ''
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchMenu = async () => {
    try {
      const { data } = await api.get('/menu-items');

      if (data.success) {
        setMenuItems(data.data);
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
      setFormData({ name: '', price: '', description: '', imageUrl: '' });
      fetchMenu();
    } catch (error) {
      toast.error('Operation failed');
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setFormData({ name: '', price: '', description: '', imageUrl: '' });
    setIsModalOpen(true);
  };

  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      price: item.price.toString(),
      description: item.description || '',
      imageUrl: item.imageUrl || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    try {
      await api.delete(`/menu-items/${id}`);
      toast.success('Item deleted');
      fetchMenu();
    } catch (error) {
      toast.error('Delete failed');
    }
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="max-w-md mx-auto md:max-w-2xl p-4 space-y-4 pb-24">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Menu</h1>
        <Button onClick={openAddModal} className="bg-orange-600 hover:bg-orange-700">
          <Plus size={18} className="mr-2" /> Add Item
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {menuItems.map(item => (
          <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-4">
            {item.imageUrl && (
              <img src={item.imageUrl} alt={item.name} className="w-20 h-20 object-cover rounded-lg bg-gray-100" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start">
                <h3 className="font-bold text-gray-900 truncate">{item.name}</h3>
                <div className="flex gap-1">
                  <button onClick={() => openEditModal(item)} className="p-1 text-gray-400 hover:text-blue-600"><Edit2 size={16} /></button>
                  <button onClick={() => handleDelete(item.id)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                </div>
              </div>
              <p className="text-sm text-gray-500 line-clamp-2">{item.description}</p>
              <div className="mt-2 font-bold text-orange-600">${item.price.toFixed(2)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingItem ? 'Edit Item' : 'Add New Item'}>
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
              className="w-full rounded-md border border-gray-300 p-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              rows={3}
              value={formData.description} 
              onChange={e => setFormData({...formData, description: e.target.value})} 
              placeholder="Ingredients, details..."
            />
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
            <Button type="submit" className="bg-orange-600 hover:bg-orange-700">
              {editingItem ? 'Save Changes' : 'Create Item'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}