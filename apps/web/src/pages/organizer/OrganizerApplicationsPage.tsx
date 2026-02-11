import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { toast } from 'react-hot-toast';
import { Check, X, Search, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Application {
  id: string;
  applicantName: string;
  applicantEmail: string;
  businessName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  eventName?: string; // Optional if we join event name
}

export function OrganizerApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/applications');
      if (data.success) {
        setApplications(data.data);
      }
    } catch (error) {
      toast.error('Failed to load applications');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    if (!confirm(`Are you sure you want to ${action} this application?`)) return;
    try {
      await api.post(`/applications/${id}/${action}`);
      toast.success(`Application ${action}ed`);
      fetchApplications();
    } catch (error) {
      toast.error(`Failed to ${action} application`);
    }
  };

  const filteredApps = applications.filter(app => {
    const matchesSearch = 
      app.applicantName.toLowerCase().includes(search.toLowerCase()) ||
      app.businessName.toLowerCase().includes(search.toLowerCase()) ||
      app.applicantEmail.toLowerCase().includes(search.toLowerCase());
    
    const matchesFilter = filter === 'ALL' || app.status === filter;
    
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendor Applications</h1>
          <p className="text-gray-500 text-sm">Manage incoming vendor requests</p>
        </div>
        <Link to="/organizer">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>

      <Card className="border-none shadow-md">
        <CardHeader className="border-b bg-white rounded-t-lg">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-full md:w-auto">
              {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                    filter === f ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {f.charAt(0) + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <Input
                placeholder="Search vendors..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="animate-spin text-orange-500" size={32} />
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="p-12 text-center text-gray-500">No applications found.</div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 font-medium border-b">
                <tr>
                  <th className="px-6 py-3">Business Name</th>
                  <th className="px-6 py-3">Applicant</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredApps.map(app => (
                  <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{app.businessName}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-gray-900">{app.applicantName}</span>
                        <span className="text-gray-500 text-xs">{app.applicantEmail}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(app.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        app.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                        app.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {app.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {app.status === 'PENDING' && (
                        <div className="flex justify-end gap-2">
                          <Button 
                            size="sm" 
                            className="bg-green-600 hover:bg-green-700 h-8 px-2"
                            onClick={() => handleAction(app.id, 'approve')}
                            title="Approve"
                          >
                            <Check size={16} />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="text-red-600 border-red-200 hover:bg-red-50 h-8 px-2"
                            onClick={() => handleAction(app.id, 'reject')}
                            title="Reject"
                          >
                            <X size={16} />
                          </Button>
                        </div>
                      )}
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
