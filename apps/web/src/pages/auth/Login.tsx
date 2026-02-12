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
import { Eye, EyeOff, Loader2 } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.post('/auth/login', data);
      const { user, token } = res.data.data;
      login(token, user);
      toast.success('Welcome back!');
      
      // Redirect based on role
      if (user.role === 'ORGANIZER') navigate('/organizer', { replace: true });
      else if (user.role === 'VENDOR') navigate('/vendor', { replace: true });
      else navigate('/home', { replace: true });
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Login failed. Please try again.';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 px-4">
      <Card className="w-full max-w-md rounded-2xl shadow-xl bg-white border-none">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-2xl font-bold text-center text-gray-900">
            Welcome to MakanX
          </CardTitle>
          <p className="text-center text-sm text-gray-500">
            Sign in to your account
          </p>
        </CardHeader>
        <CardContent className="p-6 sm:p-8 pt-4">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Input
                placeholder="Email address"
                type="email"
                autoFocus
                className="h-12 rounded-lg border-slate-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                {...register('email')}
              />
              {errors.email && <p className="text-sm text-red-500 ml-1">{errors.email.message}</p>}
            </div>
            
            <div className="space-y-2">
              <div className="relative">
                <Input
                  placeholder="Password"
                  type={showPassword ? "text" : "password"}
                  className="h-12 rounded-lg border-slate-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all pr-10"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {errors.password && <p className="text-sm text-red-500 ml-1">{errors.password.message}</p>}
            </div>

            <div className="flex justify-end">
              <Link 
                to="/forgot-password" 
                className="text-sm text-orange-600 hover:text-orange-700 font-medium hover:underline transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            <Button  
              className="w-full h-12 text-lg font-medium bg-gradient-to-r from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 transition-all rounded-lg shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed" 
              type="submit" 
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="animate-spin" size={20} />
                  <span>Signing in...</span>
                </div>
              ) : (
                "Sign In"
              )}
            </Button>

            {errorMessage && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm text-center animate-in fade-in slide-in-from-top-1">
                {errorMessage}
              </div>
            )}
          </form>
          
          <div className="mt-6 flex flex-col items-center gap-4 text-sm text-gray-500">
            <Link to="/invite" className="text-orange-600 hover:text-orange-700 font-medium hover:underline transition-colors">
              Activate vendor account
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
