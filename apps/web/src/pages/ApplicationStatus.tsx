import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { toast } from 'react-hot-toast';
import { Loader2, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

const statusSchema = z.object({
  email: z.string().email('Invalid email address'),
  phone: z.string().min(8, 'Phone number must be at least 8 digits'),
});

type StatusFormData = z.infer<typeof statusSchema>;

type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ACCOUNT_CREATED';

interface StatusResult {
  status: ApplicationStatus | null;
  message?: string;
  inviteUrl?: string;
}

export default function ApplicationStatusPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<StatusResult | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<StatusFormData>({
    resolver: zodResolver(statusSchema),
  });

  const onSubmit = async (data: StatusFormData) => {
    setIsLoading(true);
    setResult(null);
    try {
      const response = await api.post('/applications/status', data);
      if (response.data.success) {
        setResult(response.data.data);
      } else {
          toast.error(response.data.error || 'Failed to check status');
      }
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Failed to check status';
      // If 404/not found, we might want to show that in UI instead of toast
      if (msg === 'Application not found') {
          setResult({ status: null, message: 'No application found with these details.' });
      } else {
          toast.error(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderStatus = () => {
    if (!result) return null;

    if (result.status === null) {
        return (
            <div className="text-center p-6 bg-gray-50 rounded-lg border border-gray-100">
                <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                <h3 className="text-lg font-medium text-gray-900">Application Not Found</h3>
                <p className="text-gray-500 mt-1">{result.message || "We couldn't find an application with those details."}</p>
                <p className="text-sm text-gray-400 mt-4">Please check your email and phone number and try again.</p>
            </div>
        );
    }

    if (result.status === 'PENDING') {
      return (
        <div className="text-center p-6 bg-amber-50 rounded-lg border border-amber-100">
          <Clock className="mx-auto h-12 w-12 text-amber-500 mb-2" />
          <h3 className="text-lg font-medium text-amber-900">Application Under Review</h3>
          <p className="text-amber-700 mt-1">Your application is currently being reviewed by the organizer.</p>
          <p className="text-sm text-amber-600 mt-4">Please check back later.</p>
        </div>
      );
    }

    if (result.status === 'REJECTED') {
      return (
        <div className="text-center p-6 bg-red-50 rounded-lg border border-red-100">
          <XCircle className="mx-auto h-12 w-12 text-red-500 mb-2" />
          <h3 className="text-lg font-medium text-red-900">Application Rejected</h3>
          <p className="text-red-700 mt-1">Unfortunately, your application was not successful.</p>
        </div>
      );
    }

    if (result.status === 'ACCOUNT_CREATED') {
        return (
          <div className="text-center p-6 bg-blue-50 rounded-lg border border-blue-100">
            <CheckCircle className="mx-auto h-12 w-12 text-blue-500 mb-2" />
            <h3 className="text-lg font-medium text-blue-900">Account Active</h3>
            <p className="text-blue-700 mt-1">Your account has already been created.</p>
            <div className="mt-6">
                <Link to="/login">
                    <Button className="w-full">Login to Portal</Button>
                </Link>
            </div>
          </div>
        );
    }

    if (result.status === 'APPROVED') {
      return (
        <div className="text-center p-6 bg-green-50 rounded-lg border border-green-100">
          <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-2" />
          <h3 className="text-lg font-medium text-green-900">Application Approved!</h3>
          <p className="text-green-700 mt-1">Congratulations! Your application has been approved.</p>
          
          <div className="mt-6">
            <p className="text-sm text-green-800 mb-2">Click below to set up your account:</p>
            {result.inviteUrl ? (
                <a href={result.inviteUrl}>
                    <Button className="w-full bg-green-600 hover:bg-green-700">Create Vendor Account</Button>
                </a>
            ) : (
                <p className="text-red-500 text-sm">Error generating invite link. Please contact support.</p>
            )}
          </div>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Check Application Status
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Enter your details to check your vendor application status
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1">
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  {...register('email')}
                />
                {errors.email?.message && (
                  <p className="text-sm text-red-500 mt-1">{errors.email.message}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                Phone Number
              </label>
              <div className="mt-1">
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="e.g. 91234567"
                  {...register('phone')}
                />
                {errors.phone?.message && (
                  <p className="text-sm text-red-500 mt-1">{errors.phone.message}</p>
                )}
              </div>
            </div>

            <div>
              <Button
                type="submit"
                className="w-full flex justify-center"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={18} />
                    Checking...
                  </>
                ) : (
                  'Check Status'
                )}
              </Button>
            </div>
          </form>

          {result && (
            <div className="mt-8 border-t pt-6">
              {renderStatus()}
            </div>
          )}
          
          <div className="mt-6 text-center">
              <Link to="/" className="text-sm text-orange-600 hover:text-orange-500">
                  Back to Home
              </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}