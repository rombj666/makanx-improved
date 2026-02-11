import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { toast } from 'react-hot-toast';
import { Role } from '@makanx/shared';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum([Role.CUSTOMER, Role.ORGANIZER]), // Vendors registered via invite only usually
});

type RegisterForm = z.infer<typeof registerSchema>;

export function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: Role.CUSTOMER,
    }
  });

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/register', data);
      const { user, token } = res.data.data;
      login(token, user);
      toast.success('Registered successfully');
      
      if (user.role === 'ORGANIZER') navigate('/organizer');
      else navigate('/');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Create an Account</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Input
                placeholder="Full Name"
                {...register('name')}
              />
              {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <Input
                placeholder="Email"
                type="email"
                {...register('email')}
              />
              {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <Input
                placeholder="Password"
                type="password"
                {...register('password')}
              />
              {errors.password && <p className="text-sm text-red-500 mt-1">{errors.password.message}</p>}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">I am a:</label>
              <select 
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                {...register('role')}
              >
                <option value={Role.CUSTOMER}>Customer</option>
                <option value={Role.ORGANIZER}>Organizer</option>
              </select>
            </div>
            <Button className="w-full" type="submit" isLoading={isLoading}>
              Register
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            Already have an account? <Link to="/login" className="text-blue-600 hover:underline">Login</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
