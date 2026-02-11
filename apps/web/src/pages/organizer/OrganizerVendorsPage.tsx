import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { toast } from 'react-hot-toast';
import { Ban, CheckCircle, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Vendor {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  vendorProfile?: {
    businessName: string;
  };
}

export function OrganizerVendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDisabled, setShowDisabled] = useState(false);

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
                  <tr key={vendor.id} className={`hover:bg-gray-50 transition-colors ${!vendor.isActive ? 'bg-gray-50 opacity-75' : ''}`}>
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
                    <td className="px-6 py-4 text-right">
                      <Button 
                        size="sm" 
                        variant="outline"
                        className={`h-8 px-3 ${
                          vendor.isActive 
                            ? 'text-red-600 border-red-200 hover:bg-red-50' 
                            : 'text-green-600 border-green-200 hover:bg-green-50'
                        }`}
                        onClick={() => toggleStatus(vendor)}
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
    </div>
  );
}
