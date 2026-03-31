import { useState } from 'react';
import { Truck, XCircle, CheckCircle } from 'lucide-react';

export function DriverLogin() {
  const [mode, setMode] = useState
    <'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [loginForm, setLoginForm] = useState({
    email: '', password: ''
  });

  const [registerForm, setRegisterForm] = useState({
    full_name: '', email: '', password: '',
    phone: '', license_number: ''
  });

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const apiBase = typeof window !== 'undefined' &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1'
        ? 'https://employee-po-system.onrender.com'
        : '';
      const res = await fetch(`${apiBase}/api/driver/login`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify(loginForm)
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      localStorage.setItem('driver_token', 
        data.token);
      localStorage.setItem('driver_session',
        JSON.stringify(data.driver));
      window.location.href = '/driver';
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setLoading(true);
    setError('');
    try {
      const apiBase = typeof window !== 'undefined' &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1'
        ? 'https://employee-po-system.onrender.com'
        : '';
      const res = await fetch(`${apiBase}/api/driver/register`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify(registerForm)
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return;
      }
      setSuccess(
        'Registration submitted! Wait for approval.'
      );
      setMode('login');
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
  <div className="min-h-screen bg-slate-900 
    flex flex-col">
    {/* Top Brand Bar */}
    <div className="bg-slate-800 px-6 py-4 
      flex items-center gap-3 border-b 
      border-slate-700">
      <img 
        src="/kimoel-logo.png" 
        alt="Kimoel" 
        className="h-8 w-auto object-contain"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
      />
      <div>
        <p className="text-white font-bold text-sm">
          KIMOEL INNOVATION
        </p>
        <p className="text-slate-400 text-xs">
          Driver Portal
        </p>
      </div>
    </div>

    {/* Main Content */}
    <div className="flex-1 flex items-center 
      justify-center p-4">
      <div className="bg-white rounded-2xl 
        shadow-2xl w-full max-w-sm overflow-hidden">
        
        {/* Card Header */}
        <div className="bg-green-600 px-6 py-8 
          text-center">
          <div className="w-16 h-16 bg-white/20 
            rounded-2xl flex items-center 
            justify-center mx-auto mb-3">
            <Truck className="size-8 text-white" />
          </div>
          <h1 className="text-xl font-bold 
            text-white">Driver Portal</h1>
          <p className="text-green-200 text-sm mt-1">
            Deliveries & GPS Tracking
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b 
          border-slate-200">
          <button
            onClick={() => {
              setMode('login');
              setError('');
              setSuccess('');
            }}
            className={`flex-1 py-3 text-sm 
              font-medium transition-colors
              ${mode === 'login'
                ? 'text-green-600 border-b-2 border-green-600'
                : 'text-slate-500'
              }`}
          >
            Sign In
          </button>
          <button
            onClick={() => {
              setMode('register');
              setError('');
              setSuccess('');
            }}
            className={`flex-1 py-3 text-sm 
              font-medium transition-colors
              ${mode === 'register'
                ? 'text-green-600 border-b-2 border-green-600'
                : 'text-slate-500'
              }`}
          >
            Register
          </button>
        </div>

        {/* Form Area */}
        <div className="p-6">
          {error && (
            <div className="bg-red-50 border 
              border-red-200 rounded-xl p-3 mb-4
              flex items-start gap-2">
              <XCircle className="size-4 
                text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">
                {error}
              </p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border 
              border-green-200 rounded-xl p-3 mb-4
              flex items-start gap-2">
              <CheckCircle className="size-4 
                text-green-500 mt-0.5 flex-shrink-0"/>
              <p className="text-sm text-green-700">
                {success}
              </p>
            </div>
          )}

          {mode === 'login' ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold 
                  text-slate-600 uppercase tracking-wider 
                  block mb-1.5">Email</label>
                <input
                  type="email"
                  placeholder="your@email.com"
                  className="w-full border border-slate-200 
                    rounded-xl px-4 py-3 text-sm
                    focus:outline-none focus:ring-2 
                    focus:ring-green-500 bg-slate-50"
                  value={loginForm.email}
                  onChange={e => setLoginForm(
                    f => ({...f, email: e.target.value})
                  )}
                />
              </div>
              <div>
                <label className="text-xs font-semibold 
                  text-slate-600 uppercase tracking-wider 
                  block mb-1.5">Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full border border-slate-200 
                    rounded-xl px-4 py-3 text-sm
                    focus:outline-none focus:ring-2 
                    focus:ring-green-500 bg-slate-50"
                  value={loginForm.password}
                  onChange={e => setLoginForm(
                    f => ({...f, password: e.target.value})
                  )}
                  onKeyPress={e => {
                    if (e.key === 'Enter') handleLogin();
                  }}
                />
              </div>
              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full bg-green-600 
                  hover:bg-green-700 text-white py-3 
                  rounded-xl font-semibold text-sm
                  disabled:opacity-50 transition-colors
                  flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 
                      border-white/30 border-t-white 
                      rounded-full animate-spin" />
                    Signing in...
                  </>
                ) : 'Sign In'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                placeholder="Full Name *"
                className="w-full border border-slate-200 
                  rounded-xl px-4 py-3 text-sm
                  focus:outline-none focus:ring-2 
                  focus:ring-green-500 bg-slate-50"
                value={registerForm.full_name}
                onChange={e => setRegisterForm(
                  f => ({...f, 
                    full_name: e.target.value})
                )}
              />
              <input
                type="email"
                placeholder="Email *"
                className="w-full border border-slate-200 
                  rounded-xl px-4 py-3 text-sm
                  focus:outline-none focus:ring-2 
                  focus:ring-green-500 bg-slate-50"
                value={registerForm.email}
                onChange={e => setRegisterForm(
                  f => ({...f, email: e.target.value})
                )}
              />
              <input
                type="password"
                placeholder="Password *"
                className="w-full border border-slate-200 
                  rounded-xl px-4 py-3 text-sm
                  focus:outline-none focus:ring-2 
                  focus:ring-green-500 bg-slate-50"
                value={registerForm.password}
                onChange={e => setRegisterForm(
                  f => ({...f, password: e.target.value})
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Phone"
                  className="w-full border border-slate-200 
                    rounded-xl px-4 py-3 text-sm
                    focus:outline-none focus:ring-2 
                    focus:ring-green-500 bg-slate-50"
                  value={registerForm.phone}
                  onChange={e => setRegisterForm(
                    f => ({...f, phone: e.target.value})
                  )}
                />
                <input
                  placeholder="License No."
                  className="w-full border border-slate-200 
                    rounded-xl px-4 py-3 text-sm
                    focus:outline-none focus:ring-2 
                    focus:ring-green-500 bg-slate-50"
                  value={registerForm.license_number}
                  onChange={e => setRegisterForm(
                    f => ({...f, 
                      license_number: e.target.value})
                  )}
                />
              </div>
              <button
                onClick={handleRegister}
                disabled={loading}
                className="w-full bg-green-600 
                  hover:bg-green-700 text-white py-3 
                  rounded-xl font-semibold text-sm
                  disabled:opacity-50 transition-colors
                  flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 
                      border-white/30 border-t-white 
                      rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : 'Submit Registration'}
              </button>
              <p className="text-center text-xs 
                text-slate-500">
                Your account requires admin approval
                before you can sign in
              </p>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Footer */}
    <div className="text-center py-4">
      <p className="text-slate-500 text-xs">
        © 2026 Kimoel Innovation.
        Admin portal at{' '}
        <a href="/" 
          className="text-slate-400 underline">
          kimoel.onrender.com
        </a>
      </p>
    </div>
  </div>
);
}
