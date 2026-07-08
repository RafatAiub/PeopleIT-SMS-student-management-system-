import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Eye, EyeOff, Mail, Lock, Building2 } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [institutionCode, setInstitutionCode] = useState('102030');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login.mutateAsync({ 
        email: email.trim(), 
        password: password.trim(), 
        institutionCode: isSuperAdmin ? '' : institutionCode.trim() 
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

      <div className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-2">
            PeopleIT SMS
          </h1>
          <p className="text-slate-400 text-sm font-medium">Sign in to your dashboard</p>
        </div>

        <div className="glass p-8 rounded-3xl shadow-2xl border border-white/10 relative overflow-hidden bg-slate-900/40">
          <form onSubmit={handleLogin} className="space-y-5">
            
            {/* Super Admin Login Toggle */}
            <div className="flex items-center justify-between bg-slate-950/40 p-3 rounded-2xl border border-white/5 transition-all">
              <div>
                <span className="text-xs font-bold text-slate-200 block">Global Super Admin</span>
                <span className="text-[10px] text-slate-500 block">Toggle for system management</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsSuperAdmin(!isSuperAdmin);
                  if (!isSuperAdmin) setInstitutionCode('');
                  else setInstitutionCode('102030');
                }}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isSuperAdmin ? 'bg-blue-500' : 'bg-slate-800'}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isSuperAdmin ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>

            {/* Institution Code (EIIN) */}
            {!isSuperAdmin && (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Institution Code / EIIN
                </label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    pattern="[0-9]*"
                    required
                    value={institutionCode}
                    onChange={(e) => setInstitutionCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-slate-950/50 border border-slate-700/50 rounded-2xl pl-11 pr-4 py-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono text-sm"
                    placeholder="102030"
                  />
                </div>
              </div>
            )}

            {/* Email Address */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-700/50 rounded-2xl pl-11 pr-4 py-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm font-medium"
                  placeholder="admin@peopleit.com"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-700/50 rounded-2xl pl-11 pr-12 py-3 text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-sm font-medium"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                </button>
              </div>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={login.isPending}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-2xl shadow-xl shadow-blue-500/20 transition-all transform active:scale-[0.98] disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-center text-sm"
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
          
          {/* Demo Accounts - Cleared from Confusion */}
          <div className="mt-8 pt-6 border-t border-white/5 space-y-3">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Demo Accounts</h4>
            <div className="grid grid-cols-2 gap-2 text-left">
              <div className="bg-slate-950/20 p-2.5 rounded-xl border border-white/5">
                <span className="text-[10px] font-bold text-blue-400 block">Super Admin (Global)</span>
                <span className="text-[11px] text-slate-400 block mt-1">Email: <span className="text-slate-300 font-mono">admin@peopleit.com</span></span>
                <span className="text-[11px] text-slate-400 block">Pass: <span className="text-slate-300 font-mono">admin123</span></span>
                <span className="text-[9px] text-slate-500 block mt-1 italic">*Toggle switch ON</span>
              </div>
              <div className="bg-slate-950/20 p-2.5 rounded-xl border border-white/5">
                <span className="text-[10px] font-bold text-emerald-400 block">Teacher (School-based)</span>
                <span className="text-[11px] text-slate-400 block mt-1">Email: <span className="text-slate-300 font-mono">teacher@peopleit.com</span></span>
                <span className="text-[11px] text-slate-400 block">Pass: <span className="text-slate-300 font-mono">admin123</span></span>
                <span className="text-[9px] text-slate-500 block mt-1 italic">*School code: 102030</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Login;
