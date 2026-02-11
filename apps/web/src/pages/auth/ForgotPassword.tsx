import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../../lib/api';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Loader2, Mail, Lock, KeyRound } from 'lucide-react';

// Schemas
const requestSchema = z.object({
  email: z.string().email('Please enter a valid email'),
});

const confirmSchema = z.object({
  otp: z.string().length(6, 'OTP must be 6 digits'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type RequestForm = z.infer<typeof requestSchema>;
type ConfirmForm = z.infer<typeof confirmSchema>;

export function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'REQUEST' | 'CONFIRM'>('REQUEST');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requestForm = useForm<RequestForm>({
    resolver: zodResolver(requestSchema),
  });

  const confirmForm = useForm<ConfirmForm>({
    resolver: zodResolver(confirmSchema),
  });

  const onRequestSubmit = async (data: RequestForm) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await api.post('/auth/password/reset/request', data);
      setEmail(data.email);
      setStep('CONFIRM');
      toast.success('Reset code sent to your email');
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Failed to request reset';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const onConfirmSubmit = async (data: ConfirmForm) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await api.post('/auth/password/reset/confirm', {
        email,
        otp: data.otp,
        newPassword: data.newPassword,
      });
      toast.success('Password reset successfully');
      navigate('/login');
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Failed to reset password';
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
            {step === 'REQUEST' ? 'Reset Password' : 'New Password'}
          </CardTitle>
          <p className="text-center text-sm text-gray-500">
            {step === 'REQUEST' 
              ? "Enter your email to receive a reset code" 
              : `Enter the code sent to ${email}`}
          </p>
        </CardHeader>
        <CardContent className="p-6 sm:p-8 pt-4">
          
          {step === 'REQUEST' ? (
            <form onSubmit={requestForm.handleSubmit(onRequestSubmit)} className="space-y-6">
              <div className="space-y-2">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <Input
                    placeholder="Email address"
                    type="email"
                    autoFocus
                    className="pl-10 h-12 rounded-lg border-slate-300 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    {...requestForm.register('email')}
                  />
                </div>
                {requestForm.formState.errors.email && (
                  <p className="text-sm text-red-500 ml-1">{requestForm.formState.errors.email.message}</p>
                )}
              </div>

              <Button 
                className="w-full h-12 text-lg font-medium bg-gradient-to-r from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 transition-all rounded-lg" 
                type="submit" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="animate-spin" size={20} />
                    <span>Sending...</span>
                  </div>
                ) : (
                  "Send Reset Code"
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={confirmForm.handleSubmit(onConfirmSubmit)} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <Input
                      placeholder="6-digit Code"
                      type="text"
                      maxLength={6}
                      autoFocus
                      className="pl-10 h-12 rounded-lg border-slate-300 focus:ring-2 focus:ring-orange-500 tracking-widest text-lg"
                      {...confirmForm.register('otp')}
                    />
                  </div>
                  {confirmForm.formState.errors.otp && (
                    <p className="text-sm text-red-500 ml-1">{confirmForm.formState.errors.otp.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <Input
                      placeholder="New Password"
                      type="password"
                      className="pl-10 h-12 rounded-lg border-slate-300 focus:ring-2 focus:ring-orange-500"
                      {...confirmForm.register('newPassword')}
                    />
                  </div>
                  {confirmForm.formState.errors.newPassword && (
                    <p className="text-sm text-red-500 ml-1">{confirmForm.formState.errors.newPassword.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <Input
                      placeholder="Confirm Password"
                      type="password"
                      className="pl-10 h-12 rounded-lg border-slate-300 focus:ring-2 focus:ring-orange-500"
                      {...confirmForm.register('confirmPassword')}
                    />
                  </div>
                  {confirmForm.formState.errors.confirmPassword && (
                    <p className="text-sm text-red-500 ml-1">{confirmForm.formState.errors.confirmPassword.message}</p>
                  )}
                </div>
              </div>

              <Button 
                className="w-full h-12 text-lg font-medium bg-gradient-to-r from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 transition-all rounded-lg" 
                type="submit" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="animate-spin" size={20} />
                    <span>Resetting...</span>
                  </div>
                ) : (
                  "Reset Password"
                )}
              </Button>
            </form>
          )}

          {errorMessage && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm text-center animate-in fade-in slide-in-from-top-1">
              {errorMessage}
            </div>
          )}

          <div className="mt-6 text-center">
            <Link to="/login" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-800 transition-colors">
              <ArrowLeft size={16} className="mr-1" />
              Back to Login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
