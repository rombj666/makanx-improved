import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { toast } from 'react-hot-toast';

interface Application {
  id: string;
  applicantName: string;
  businessName: string;
  applicantEmail: string;
  status: string;
  event: {
    name: string;
  };
}

export function VendorApplications() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
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

  const handleApprove = async (id: string) => {
    try {
      const { data } = await api.post(`/applications/${id}/approve`);
      if (data.success) {
        toast.success('Application approved!');
        // Show invite URL (in real app, email sent)
        alert(`Invite URL: ${data.data.inviteUrl}`); 
        fetchApplications();
      }
    } catch (error) {
      toast.error('Failed to approve');
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm('Are you sure you want to reject this application?')) return;
    try {
      const { data } = await api.post(`/applications/${id}/reject`);
      if (data.success) {
        toast.success('Application rejected');
        fetchApplications();
      }
    } catch (error) {
      toast.error('Failed to reject');
    }
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Vendor Applications</h2>
      <div className="grid gap-4">
        {applications.length === 0 && <p>No pending applications.</p>}
        {applications.map((app) => (
          <Card key={app.id}>
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <h3 className="font-bold text-lg">{app.businessName}</h3>
                <p className="text-sm text-gray-600">Applicant: {app.applicantName} ({app.applicantEmail})</p>
                <p className="text-sm text-gray-500">Event: {app.event.name}</p>
                <p className="text-sm font-medium mt-1">Status: {app.status}</p>
              </div>
              {app.status === 'PENDING' && (
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={() => handleReject(app.id)}>Reject</Button>
                  <Button size="sm" onClick={() => handleApprove(app.id)}>Approve</Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
