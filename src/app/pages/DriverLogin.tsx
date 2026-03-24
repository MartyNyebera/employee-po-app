import { useState } from 'react';
import { Truck } from 'lucide-react';

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
      const res = await fetch('/api/driver/login', {
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
      const res = await fetch('/api/driver/register', {
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
      flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl 
        shadow-2xl w-full max-w-sm p-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 
            rounded-2xl flex items-center 
            justify-center mx-auto mb-3">
            <Truck className="size-8 
              text-green-600" />
          </div>
          <h1 className="text-xl font-bold 
            text-slate-900">Driver Portal</h1>
          <p className="text-sm text-slate-500">
            Kimoel Innovation
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border 
            border-red-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-700">
              {error}
            </p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border 
            border-green-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-green-700">
              {success}
            </p>
          </div>
        )}

        {mode === 'login' ? (
          <div className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              className="w-full border border-slate-200 
                rounded-xl px-4 py-3 text-sm"
              value={loginForm.email}
              onChange={e => setLoginForm(
                f => ({...f, email: e.target.value})
              )}
            />
            <input
              type="password"
              placeholder="Password"
              className="w-full border border-slate-200 
                rounded-xl px-4 py-3 text-sm"
              value={loginForm.password}
              onChange={e => setLoginForm(
                f => ({...f, password: e.target.value})
              )}
            />
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-green-600 
                text-white py-3 rounded-xl 
                font-semibold text-sm
                disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
            <p className="text-center text-sm 
              text-slate-500">
              No account?{' '}
              <button
                onClick={() => setMode('register')}
                className="text-green-600 font-medium"
              >
                Register here
              </button>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              placeholder="Full Name *"
              className="w-full border border-slate-200 
                rounded-xl px-4 py-3 text-sm"
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
                rounded-xl px-4 py-3 text-sm"
              value={registerForm.email}
              onChange={e => setRegisterForm(
                f => ({...f, email: e.target.value})
              )}
            />
            <input
              type="password"
              placeholder="Password *"
              className="w-full border border-slate-200 
                rounded-xl px-4 py-3 text-sm"
              value={registerForm.password}
              onChange={e => setRegisterForm(
                f => ({...f, password: e.target.value})
              )}
            />
            <input
              placeholder="Phone"
              className="w-full border border-slate-200 
                rounded-xl px-4 py-3 text-sm"
              value={registerForm.phone}
              onChange={e => setRegisterForm(
                f => ({...f, phone: e.target.value})
              )}
            />
            <input
              placeholder="License Number"
              className="w-full border border-slate-200 
                rounded-xl px-4 py-3 text-sm"
              value={registerForm.license_number}
              onChange={e => setRegisterForm(
                f => ({...f, 
                  license_number: e.target.value})
              )}
            />
            <button
              onClick={handleRegister}
              disabled={loading}
              className="w-full bg-green-600 
                text-white py-3 rounded-xl 
                font-semibold text-sm
                disabled:opacity-50"
            >
              {loading 
                ? 'Submitting...' 
                : 'Submit Registration'}
            </button>
            <p className="text-center text-sm 
              text-slate-500">
              Have an account?{' '}
              <button
                onClick={() => setMode('login')}
                className="text-green-600 font-medium"
              >
                Login here
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
