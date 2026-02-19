import { useState } from 'react';
import type { UserRole } from '../App';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { User, Shield, Eye, EyeOff, Check } from 'lucide-react';
import { login, register, setStoredAuth } from '../api/client';
import { toast } from 'sonner';

interface LoginScreenProps {
  onLogin: (role: UserRole, name: string, isSuperAdmin?: boolean) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'employee' | 'admin' | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      const { user, token } = await login(email, password);
      setStoredAuth(user, token);
      onLogin(user.role, user.name, user.isSuperAdmin);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      toast.error(msg, { description: msg === 'Account not found' ? 'Please check your email or create an account.' : msg === 'Password incorrect' ? 'Please try again or reset your password.' : undefined });
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !name || !role) return;
    setLoading(true);
    try {
      const result = await register(email, password, name, role);

      // Admin signup: never log in — account must be approved first
      if (role === 'admin') {
        toast.success('Thank you for creating an account as an Admin', {
          description: 'This will undergo verification and approval by the CEO. Please check your email for updates.',
        });
        setMode('login');
        setEmail('');
        setPassword('');
        setName('');
        setRole(null);
        setLoading(false);
        return;
      }

      // Employee: log in after successful signup
      const { user, token } = result;
      setStoredAuth(user, token);
      onLogin(user.role, user.name, user.isSuperAdmin);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign up failed';
      toast.error(msg, {
        description:
          msg.includes('already exists')
            ? 'This email is already registered. Try signing in instead.'
            : msg.includes('pending admin request')
              ? 'Wait for your current request to be reviewed.'
              : undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel - brand */}
      <div className="hidden lg:flex lg:w-[420px] xl:w-[480px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex-col justify-between p-10 text-white relative overflow-hidden">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23D4AF37' fill-opacity='0.4'%3E%3Ccircle cx='7' cy='7' r='7'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat'
          }}></div>
        </div>
        
        <div className="relative z-10">
          <div className="flex flex-col items-center mb-16">
            <img
              src="/kimoel-logo.png"
              alt="Kimoel Innovation"
              className="h-24 w-auto object-contain mb-6 drop-shadow-lg"
            />
            <span className="font-bold text-3xl tracking-tight text-center bg-gradient-to-r from-white to-amber-100 bg-clip-text text-transparent">Kimoel Tracking System</span>
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold tracking-tight text-slate-50 leading-tight text-center mb-6 max-w-lg">
            Fleet tracking & purchase orders in one place
          </h1>
          <p className="mt-4 text-slate-300 text-lg max-w-md text-center leading-relaxed">
            Monitor assets, manage orders, and track transactions with a single professional dashboard designed for modern fleet management.
          </p>
        </div>
        <p className="text-slate-500 text-sm relative z-10">© Kimoel Tracking System</p>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md border-0 shadow-2xl shadow-slate-300/20 bg-white/95 backdrop-blur-sm rounded-2xl border border-slate-200/50">
          <CardHeader className="space-y-1 pb-8">
            <div className="lg:hidden flex flex-col items-center mb-6">
              <img
                src="/kimoel-logo.png"
                alt="Kimoel Innovation"
                className="h-16 w-auto object-contain mb-3 drop-shadow-lg"
              />
              <span className="font-bold text-xl text-slate-900 text-center bg-gradient-to-r from-slate-900 to-amber-600 bg-clip-text text-transparent">Kimoel Tracking System</span>
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900 tracking-tight">
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </CardTitle>
            <CardDescription className="text-slate-600 text-base">
              {mode === 'login'
                ? 'Enter your credentials to access the dashboard.'
                : 'Register for access to the tracking system.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex gap-1 p-1 bg-gradient-to-r from-slate-100 to-slate-50 rounded-xl border border-slate-200/50 shadow-inner">
              <Button
                type="button"
                variant={mode === 'login' ? 'default' : 'ghost'}
                size="sm"
                className={`flex-1 rounded-lg transition-all duration-300 ${
                  mode === 'login' 
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/25 border border-blue-500/20' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
                }`}
                onClick={() => setMode('login')}
              >
                <User className="size-4 mr-2" />
                Sign In
              </Button>
              <Button
                type="button"
                variant={mode === 'signup' ? 'default' : 'ghost'}
                size="sm"
                className={`flex-1 rounded-lg transition-all duration-300 ${
                  mode === 'signup' 
                    ? 'bg-gradient-to-r from-amber-600 to-amber-700 text-white shadow-lg shadow-amber-500/25 border border-amber-500/20' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
                }`}
                onClick={() => setMode('signup')}
              >
                <Shield className="size-4 mr-2" />
                Sign Up
              </Button>
            </div>

            {mode === 'login' ? (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-700 font-semibold text-sm">Email</Label>
                  <div className="relative">
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      className={`border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all duration-200 pr-10 ${
                        focusedField === 'email' ? 'shadow-lg shadow-amber-500/10' : ''
                      }`}
                      required
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <User className={`size-4 transition-colors duration-200 ${
                        focusedField === 'email' ? 'text-amber-500' : 'text-slate-400'
                      }`} />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-700 font-semibold text-sm">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      className={`border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all duration-200 pr-10 ${
                        focusedField === 'password' ? 'shadow-lg shadow-amber-500/10' : ''
                      }`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors duration-200"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  <Button 
                    type="submit" 
                    className={`w-full h-11 font-semibold text-base transition-all duration-300 ${
                      loading 
                        ? 'bg-slate-400 cursor-not-allowed' 
                        : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 border border-blue-500/20'
                    }`}
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                        Signing in...
                      </span>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                  
                  <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 text-amber-500 border-slate-300 rounded focus:ring-amber-500 focus:ring-2"
                      />
                      <span className="text-slate-600 group-hover:text-slate-800 transition-colors">Remember me</span>
                    </label>
                    <button
                      type="button"
                      className="text-amber-600 hover:text-amber-700 font-medium transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                  
                  <p className="text-xs text-slate-500 text-center flex items-center justify-center gap-1">
                    <Check className="size-3 text-green-500" />
                    Secure login with encryption
                  </p>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSignupSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-slate-700 font-medium">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-slate-50/80 border-slate-200 focus:ring-2 focus:ring-blue-500/20"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-slate-700 font-medium">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-slate-50/80 border-slate-200 focus:ring-2 focus:ring-blue-500/20"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-name" className="text-slate-700 font-medium">Full name</Label>
                  <Input
                    id="signup-name"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-slate-50/80 border-slate-200 focus:ring-2 focus:ring-blue-500/20"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 font-medium">Role</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRole('employee')}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        role === 'employee'
                          ? 'border-blue-500 bg-blue-50 text-slate-900'
                          : 'border-slate-200 bg-white hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      <User className={`size-5 mb-2 ${role === 'employee' ? 'text-blue-600' : 'text-slate-400'}`} />
                      <span className="text-sm font-medium block">Employee</span>
                      <span className="text-xs text-slate-500">View only</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('admin')}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        role === 'admin'
                          ? 'border-blue-500 bg-blue-50 text-slate-900'
                          : 'border-slate-200 bg-white hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      <Shield className={`size-5 mb-2 ${role === 'admin' ? 'text-blue-600' : 'text-slate-400'}`} />
                      <span className="text-sm font-medium block">Admin</span>
                      <span className="text-xs text-slate-500">Requires approval from Developer/Owner</span>
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 font-medium" disabled={loading || !role}>
                  {loading ? 'Creating account...' : 'Create account'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
