import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { toast } from 'react-hot-toast';

const inviteSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type InviteForm = z.infer<typeof inviteSchema>;

export function Invite() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { login } = useAuth();
  
  const [inviteData, setInviteData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
  });

  useEffect(() => {
    if (!token) {
      toast.error('Invalid invite link');
      setIsLoading(false);
      return;
    }

    const verifyToken = async () => {
      try {
        const { data } = await api.get(`/auth/invite/verify?token=${token}`);
        if (data.success) {
          setInviteData(data.data);
        }
      } catch (error: any) {
        toast.error(error.response?.data?.error || 'Invalid or expired invite');
      } finally {
        setIsLoading(false);
      }
    };
    verifyToken();
  }, [token]);

  const onSubmit = async (data: InviteForm) => {
    if (!token) return;
    setIsSubmitting(true);
    try {
      const res = await api.post('/auth/invite/accept', {
        token,
        password: data.password,
      });
      const { user, token: authToken } = res.data.data;
      login(authToken, user);
      toast.success('Account created! Welcome to MakanX.');
      navigate('/vendor');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to accept invite');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="flex justify-center items-center h-screen">Verifying invite...</div>;
  if (!inviteData) return <div className="flex justify-center items-center h-screen">Invalid invite.</div>;

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Welcome, {inviteData.email}</CardTitle>
          <p className="text-center text-sm text-gray-600">
            Set up your account for <strong>{inviteData.businessName}</strong>
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Input
                placeholder="Create Password"
                type="password"
                {...register('password')}
              />
              {errors.password && <p className="text-sm text-red-500 mt-1">{errors.password.message}</p>}
            </div>
            <div>
              <Input
                placeholder="Confirm Password"
                type="password"
                {...register('confirmPassword')}
              />
              {errors.confirmPassword && <p className="text-sm text-red-500 mt-1">{errors.confirmPassword.message}</p>}
            </div>
            <Button className="w-full" type="submit" isLoading={isSubmitting}>
              Create Account
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
