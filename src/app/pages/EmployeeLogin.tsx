import { useState } from 'react';
import { Package, XCircle, CheckCircle } from 'lucide-react';

export function EmployeeLogin() {
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
    department: '', position: '', phone: ''
  });

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/employee/login', {
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
      localStorage.setItem('employee_token', 
        data.token);
      localStorage.setItem('employee_session',
        JSON.stringify(data.employee));
      window.location.href = '/employee';
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setLoading(true);
    setError('');
    
    // Validate required fields
    if (!registerForm.full_name.trim()) {
      setError('Full name is required');
      setLoading(false);
      return;
    }
    if (!registerForm.email.trim()) {
      setError('Email is required');
      setLoading(false);
      return;
    }
    if (!registerForm.password.trim()) {
      setError('Password is required');
      setLoading(false);
      return;
    }
    
    try {
      const res = await fetch(
        '/api/employee/register', {
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
        'Registration submitted! Wait for admin approval.'
      );
      setMode('login');
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`.kimoel-title { color: white !important; }
      .text-slate-50 { color: white !important; }
      .text-slate-300 { color: white !important; }
      .text-slate-500 { color: white !important; }
      .employee-title { color: white !important; }`}</style>
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
                className="h-32 w-auto object-contain mb-6 drop-shadow-lg"
              />
              <span className="font-bold text-3xl tracking-tight text-center employee-title">Kimoel Employee Portal</span>
            </div>
            <h1 className="text-4xl xl:text-5xl font-bold tracking-tight text-slate-50 leading-tight text-center mb-6 max-w-lg">
              Material requests & inventory management
            </h1>
            <p className="mt-4 text-slate-300 text-lg max-w-md text-center leading-relaxed">
              Submit material requests, track inventory, and manage your workflow with our professional employee portal designed for modern operations.
            </p>
          </div>
          <p className="text-slate-500 text-sm relative z-10">© Kimoel Employee Portal</p>
        </div>

        {/* Right panel - form */}
        <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-slate-100">
          <div className="w-full max-w-md border-0 shadow-2xl shadow-slate-300/20 bg-white/95 backdrop-blur-sm rounded-2xl border border-slate-200/50 overflow-hidden">
            
            
            {/* Tab Switcher */}
            <div className="flex border-b border-slate-200 bg-white">
              <button
                onClick={() => {
                  setMode('login');
                  setError('');
                  setSuccess('');
                }}
                className={`flex-1 py-4 text-sm font-medium transition-all duration-200 ${
                  mode === 'login'
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                    : 'text-slate-700 hover:text-slate-800 hover:bg-slate-50'
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
                className={`flex-1 py-4 text-sm font-medium transition-all duration-200 ${
                  mode === 'register'
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                    : 'text-slate-700 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                Register
              </button>
            </div>

            {/* Form Area */}
            <div className="p-8 bg-white">
                            
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
                  <XCircle className="size-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-700 font-medium">{error}</p>
                </div>
              )}

              {success && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-start gap-3">
                  <CheckCircle className="size-5 text-green-500 mt-0.5 flex-shrink-0"/>
                  <p className="text-sm text-green-700 font-medium">{success}</p>
                </div>
              )}

              {mode === 'login' ? (
                <div className="space-y-5">
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-2">Email</label>
                    <input
                      type="email"
                      placeholder="your@email.com"
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all duration-200"
                      value={loginForm.email}
                      onChange={e => setLoginForm(f => ({...f, email: e.target.value}))}
                      onKeyPress={e => {
                        if (e.key === 'Enter') handleLogin();
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-2">Password</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all duration-200"
                      value={loginForm.password}
                      onChange={e => setLoginForm(f => ({...f, password: e.target.value}))}
                      onKeyPress={e => {
                        if (e.key === 'Enter') handleLogin();
                      }}
                    />
                  </div>
                  <button
                    onClick={handleLogin}
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white py-3.5 rounded-xl font-semibold text-sm disabled:opacity-50 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Signing in...
                      </>
                    ) : 'Sign In'}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Full Name */}
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-2">Full Name</label>
                    <input
                      placeholder="Enter your full name"
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all duration-200"
                      value={registerForm.full_name}
                      onChange={e => setRegisterForm(f => ({...f, full_name: e.target.value}))}
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-2">Email</label>
                    <input
                      type="email"
                      placeholder="your@email.com"
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all duration-200"
                      value={registerForm.email}
                      onChange={e => setRegisterForm(f => ({...f, email: e.target.value}))}
                    />
                  </div>

                  {/* Password */}
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-2">Password</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all duration-200"
                      value={registerForm.password}
                      onChange={e => setRegisterForm(f => ({...f, password: e.target.value}))}
                    />
                  </div>

                  {/* Department and Position - Side by Side */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-semibold text-slate-700 block mb-2">Department</label>
                      <input
                        placeholder="Department"
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all duration-200"
                        value={registerForm.department}
                        onChange={e => setRegisterForm(f => ({...f, department: e.target.value}))}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-slate-700 block mb-2">Position</label>
                      <input
                        placeholder="Position"
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all duration-200"
                        value={registerForm.position}
                        onChange={e => setRegisterForm(f => ({...f, position: e.target.value}))}
                      />
                    </div>
                  </div>

                  {/* Phone Number */}
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-2">Phone Number</label>
                    <input
                      placeholder="Enter phone number"
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-all duration-200"
                      value={registerForm.phone}
                      onChange={e => setRegisterForm(f => ({...f, phone: e.target.value}))}
                    />
                  </div>
                  <button
                    onClick={handleRegister}
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white py-3.5 rounded-xl font-semibold text-sm disabled:opacity-50 transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Submitting...
                      </>
                    ) : 'Submit Registration'}
                  </button>
                  <p className="text-center text-xs text-slate-500 bg-blue-50/50 rounded-lg py-3 px-4 border border-blue-100">
                    <strong>Note:</strong> Your account requires admin approval before you can sign in
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-8 py-4 border-t border-slate-100">
              <p className="text-center text-xs text-slate-500">
                2026 Kimoel Innovation. Admin portal at{' '}
                <a href="/" className="text-blue-600 hover:text-blue-700 underline transition-colors">
                  kimoel.onrender.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
