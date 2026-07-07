import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [institutionCode, setInstitutionCode] = useState('102030');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login.mutateAsync({ 
        email, 
        password, 
        institutionCode: isSuperAdmin ? '' : institutionCode 
      });
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
    } catch (err) {
      // Error handling is managed by hook toast notification
    }
  };


  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      {/* Background gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/20 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-2">
            PeopleIT SMS
          </h1>
          <p className="text-slate-400">Sign in to your dashboard</p>
        </div>

        <div className="glass p-8 rounded-2xl shadow-2xl border border-white/10 relative overflow-hidden">
          <form onSubmit={handleLogin} className="space-y-6">
            
            {/* Super Admin Login Toggle */}
            <div className="flex items-center justify-between bg-slate-900/40 p-3 rounded-xl border border-white/5">
              <span className="text-xs font-semibold text-slate-300">Sign in as Global Super Admin</span>
              <button
                type="button"
                onClick={() => {
                  setIsSuperAdmin(!isSuperAdmin);
                  if (!isSuperAdmin) setInstitutionCode('');
                  else setInstitutionCode('102030');
                }}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isSuperAdmin ? 'bg-blue-600' : 'bg-slate-700'}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isSuperAdmin ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>

            {!isSuperAdmin && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Institution Code / EIIN
                </label>
                <input
                  type="text"
                  pattern="[0-9]*"
                  required
                  value={institutionCode}
                  onChange={(e) => setInstitutionCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono"
                  placeholder="102030"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                placeholder="admin@peopleit.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={login.isPending}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {login.isPending ? (
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
          
          <div className="mt-6 text-center text-sm text-slate-500">
            <p>Demo accounts:</p>
            <p className="mt-1">admin@peopleit.com / teacher@peopleit.com</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
