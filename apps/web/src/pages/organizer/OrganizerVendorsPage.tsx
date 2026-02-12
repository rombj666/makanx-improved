import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { toast } from 'react-hot-toast';
import { Ban, CheckCircle, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Modal } from '../../components/ui/Modal';

interface Vendor {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  vendorProfile?: {
    businessName: string;
    description?: string;
    phoneNumber?: string;
    category?: string;
    priceRange?: string;
  };
}

export function OrganizerVendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDisabled, setShowDisabled] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);

  useEffect(() => {
    fetchVendors();
  }, [showDisabled]);

  const fetchVendors = async () => {
    setIsLoading(true);
    try {
      // If showDisabled is true, we want ALL vendors (active=all? or just separate lists?)
      // Backend supports ?active=true|false. 
      // If we want to toggle "Show Disabled", maybe we want to see disabled ones.
      // Let's assume toggle switches between "Active Only" and "All" or "Disabled".
      // Requirement: "Default shows only active vendors. Toggle: Show Disabled"
      // Let's query based on toggle.
      const query = showDisabled ? '' : '?active=true'; 
      const { data } = await api.get(`/organizer/vendors${query}`);
      if (data.success) {
        setVendors(data.data);
      }
    } catch (error) {
      toast.error('Failed to load vendors');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleStatus = async (vendor: Vendor) => {
    const action = vendor.isActive ? 'disable' : 'enable';
    if (!confirm(`Are you sure you want to ${action} this vendor?`)) return;

    try {
      await api.patch(`/organizer/vendors/${vendor.id}/${action}`);
      toast.success(`Vendor ${action}d successfully`);
      fetchVendors();
    } catch (error) {
      toast.error(`Failed to ${action} vendor`);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registered Vendors</h1>
          <p className="text-gray-500 text-sm">Manage vendor access and accounts</p>
        </div>
        <Link to="/organizer">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>

      <Card className="border-none shadow-md">
        <CardHeader className="border-b bg-white rounded-t-lg py-4">
          <div className="flex justify-between items-center">
            <h3 className="font-medium text-gray-700">Vendor List</h3>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 cursor-pointer select-none flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={showDisabled} 
                  onChange={(e) => setShowDisabled(e.target.checked)}
                  className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                Show Disabled
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="animate-spin text-orange-500" size={32} />
            </div>
          ) : vendors.length === 0 ? (
            <div className="p-12 text-center text-gray-500">No vendors found.</div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 font-medium border-b">
                <tr>
                  <th className="px-6 py-3">Business Name</th>
                  <th className="px-6 py-3">Contact</th>
                  <th className="px-6 py-3">Joined</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {vendors.map(vendor => (
                  <tr 
                    key={vendor.id} 
                    className={`hover:bg-gray-50 transition-colors cursor-pointer ${!vendor.isActive ? 'bg-gray-50 opacity-75' : ''}`}
                    onClick={() => setSelectedVendor(vendor)}
                  >
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {vendor.vendorProfile?.businessName || 'N/A'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-gray-900">{vendor.name}</span>
                        <span className="text-gray-500 text-xs">{vendor.email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(vendor.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        vendor.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {vendor.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className={`h-8 px-3 ${
                          vendor.isActive 
                            ? 'text-red-600 border-red-200 hover:bg-red-50' 
                            : 'text-green-600 border-green-200 hover:bg-green-50'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation(); // prevent modal opening
                          toggleStatus(vendor);
                        }}
                      >
                        {vendor.isActive ? (
                          <>
                            <Ban size={14} className="mr-1.5" />
                            Disable
                          </>
                        ) : (
                          <>
                            <CheckCircle size={14} className="mr-1.5" />
                            Enable
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={!!selectedVendor}
        onClose={() => setSelectedVendor(null)}
        title="Vendor Profile"
      >
        {selectedVendor && (
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedVendor.vendorProfile?.businessName || 'No Business Name'}</h2>
                <p className="text-sm text-gray-500">Joined {new Date(selectedVendor.createdAt).toLocaleDateString()}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                selectedVendor.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {selectedVendor.isActive ? 'Active' : 'Disabled'}
              </span>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Contact Name</label>
                  <p className="text-gray-900">{selectedVendor.name}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Email</label>
                  <p className="text-gray-900">{selectedVendor.email}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Phone</label>
                  <p className="text-gray-900">{selectedVendor.vendorProfile?.phoneNumber || '-'}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Category</label>
                  <p className="text-gray-900">{selectedVendor.vendorProfile?.category || '-'}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase">Price Range</label>
                  <p className="text-gray-900">{selectedVendor.vendorProfile?.priceRange || '-'}</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Description</label>
                <p className="text-gray-900 mt-1 text-sm leading-relaxed">
                  {selectedVendor.vendorProfile?.description || 'No description provided.'}
                </p>
              </div>
            </div>

            <div className="pt-4 border-t flex justify-end">
              <Button 
                variant={selectedVendor.isActive ? 'outline' : 'default'}
                className={selectedVendor.isActive ? 'text-red-600 border-red-200 hover:bg-red-50' : 'bg-green-600 hover:bg-green-700'}
                onClick={() => {
                   toggleStatus(selectedVendor);
                   setSelectedVendor(prev => prev ? { ...prev, isActive: !prev.isActive } : null);
                }}
              >
                {selectedVendor.isActive ? (
                  <>
                    <Ban size={16} className="mr-2" />
                    Disable Vendor Account
                  </>
                ) : (
                  <>
                    <CheckCircle size={16} className="mr-2" />
                    Enable Vendor Account
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
