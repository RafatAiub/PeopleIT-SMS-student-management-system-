import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Eye, EyeOff, Mail, Lock, Building2 } from 'lucide-react';
import apiClient from '../api/client';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [institutionCode, setInstitutionCode] = useState('102030');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        const response = await apiClient.get('/institution/public/list');
        setInstitutions(response.data.data || []);
      } catch (err) {
        console.error('Failed to load institutions list', err);
      }
    };
    fetchInstitutions();
  }, []);

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
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F172A] flex items-center justify-center p-4 transition-colors duration-300">
      {/* Background gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/20 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-emerald-500 dark:from-blue-400 dark:to-emerald-400 mb-2">
            PeopleIT SMS
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Sign in to your dashboard</p>
        </div>

        <div className="glass-card p-8 shadow-2xl relative overflow-hidden bg-white/40 dark:bg-slate-900/40 animate-fadeIn">
          <form onSubmit={handleLogin} className="space-y-5">
            
            {/* Institution Select Dropdown */}
            <div className="space-y-1.5 animate-fadeIn" style={{ animationDelay: '50ms' }}>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Select Institution / Portal
              </label>
              <div className="relative">
                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  value={isSuperAdmin ? 'global-admin' : institutionCode}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'global-admin') {
                      setIsSuperAdmin(true);
                      setInstitutionCode('');
                    } else {
                      setIsSuperAdmin(false);
                      setInstitutionCode(val);
                    }
                  }}
                  className="input-field pl-11 pr-10 py-3 text-sm font-medium appearance-none cursor-pointer"
                >
                  <option value="102030" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">Dhaka City School (102030)</option>
                  <option value="global-admin" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">Global Admin</option>
                  {institutions.filter(inst => inst.slug !== '102030').map((inst) => (
                    <option key={inst.slug} value={inst.slug} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                      {inst.name} ({inst.slug})
                    </option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Email Address */}
            <div className="space-y-1.5 animate-fadeIn" style={{ animationDelay: '100ms' }}>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field pl-11 py-3 text-sm font-medium"
                  placeholder="admin@peopleit.com"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5 animate-fadeIn" style={{ animationDelay: '150ms' }}>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-11 pr-12 py-3 text-sm font-medium"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none transition-colors"
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
              className="btn-primary w-full justify-center py-3 text-sm animate-fadeIn"
              style={{ animationDelay: '200ms' }}
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
          
          {/* Demo Accounts — local development only, never rendered in a production build */}
          {import.meta.env.DEV && (
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-white/5 space-y-3 animate-fadeIn" style={{ animationDelay: '250ms' }}>
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Demo Accounts (Dev Only)</h4>
              <div className="grid grid-cols-2 gap-2 text-left">
                <div className="bg-slate-50 dark:bg-white/5 p-2.5 rounded-xl border border-slate-200 dark:border-white/5">
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 block">Super Admin (Global)</span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 block mt-1">Email: <span className="text-slate-700 dark:text-slate-300 font-mono">admin@peopleit.com</span></span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 block">Pass: <span className="text-slate-700 dark:text-slate-300 font-mono">admin123</span></span>
                  <span className="text-[9px] text-slate-500 block mt-1 italic">*Select 'Global Admin'</span>
                </div>
                <div className="bg-slate-50 dark:bg-white/5 p-2.5 rounded-xl border border-slate-200 dark:border-white/5">
                  <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 block">Teacher (School-based)</span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 block mt-1">Email: <span className="text-slate-700 dark:text-slate-300 font-mono">teacher@peopleit.com</span></span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 block">Pass: <span className="text-slate-700 dark:text-slate-300 font-mono">admin123</span></span>
                  <span className="text-[9px] text-slate-500 block mt-1 italic">*Select school from dropdown</span>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default Login;

