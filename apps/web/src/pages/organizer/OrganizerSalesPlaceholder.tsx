import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { BarChart3, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export function OrganizerSalesPlaceholder() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-lg text-center p-8 shadow-lg border-none">
        <CardHeader>
          <div className="mx-auto bg-orange-100 p-4 rounded-full w-20 h-20 flex items-center justify-center mb-4">
            <BarChart3 size={40} className="text-orange-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">Real-time Sales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-gray-500 text-lg">
            Phase 2: Real-time sales analytics and reporting are coming soon.
          </p>
          <div className="pt-4">
            <Link to="/organizer">
              <Button variant="outline" className="gap-2">
                <ArrowLeft size={18} />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
