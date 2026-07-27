import React, { useState } from 'react';
import { Building2, User, CheckCircle2, ChevronRight, ChevronLeft, Mail, Lock, Phone, Globe, Shield, AlertTriangle, X, Eye, EyeOff, Copy, Wand2 } from 'lucide-react';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';

interface RegistrationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const RegistrationWizard: React.FC<RegistrationWizardProps> = ({ isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sendInvitation, setSendInvitation] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [createdSummary, setCreatedSummary] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    address: '',
    phone: '',
    adminFirstName: '',
    adminLastName: '',
    adminEmail: '',
    adminPassword: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleClose = () => {
    setStep(1);
    setSubmitting(false);
    setCreatedSummary(null);
    setFormData({
      name: '',
      slug: '',
      address: '',
      phone: '',
      adminFirstName: '',
      adminLastName: '',
      adminEmail: '',
      adminPassword: '',
    });
    setErrors({});
    setShowPassword(false);
    setSendInvitation(true);
    onClose();
  };

  if (!isOpen) return null;

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData(prev => ({ ...prev, adminPassword: pwd }));
    setShowPassword(true);
    toast.success('Generated initial admin password!');
  };

  const validateStep1 = () => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim() || formData.name.trim().length < 2) {
      errs.name = 'Institution name must be at least 2 characters';
    }
    if (!formData.slug.trim() || !/^\d+$/.test(formData.slug.trim())) {
      errs.slug = 'Institution Code / EIIN must be a numeric value';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep2 = () => {
    const errs: Record<string, string> = {};
    if (!formData.adminFirstName.trim()) errs.adminFirstName = 'First name is required';
    if (!formData.adminLastName.trim()) errs.adminLastName = 'Last name is required';
    if (!formData.adminEmail.trim() || !EMAIL_REGEX.test(formData.adminEmail.trim())) {
      errs.adminEmail = 'Enter a valid email address';
    }
    if (!sendInvitation) {
      if (!formData.adminPassword || formData.adminPassword.length < 6) {
        errs.adminPassword = 'Password must be at least 6 characters';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep((step - 1) as 1 | 2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const passwordToUse = formData.adminPassword.trim()
      ? formData.adminPassword.trim()
      : `SMS#${Math.random().toString(36).slice(-6)}!9A`;

    try {
      await apiClient.post('/institution', {
        name: formData.name.trim(),
        slug: formData.slug.trim(),
        adminFirstName: formData.adminFirstName.trim(),
        adminLastName: formData.adminLastName.trim(),
        adminEmail: formData.adminEmail.trim().toLowerCase(),
        adminPassword: passwordToUse,
        sendInvitation,
      });

      setCreatedSummary({
        name: formData.name.trim(),
        slug: formData.slug.trim(),
        adminEmail: formData.adminEmail.trim().toLowerCase(),
        adminPassword: passwordToUse,
      });

      toast.success('Institution and Administrator registered successfully!');
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to register institution');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-y-auto max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/5 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-2xl shadow-md">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Register Sub-Institution</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">3-Step Onboarding Wizard</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-between mb-8 px-4">
          <div className={`flex items-center gap-2 ${step >= 1 ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-400'}`}>
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>1</span>
            <span className="text-xs hidden sm:inline">Institution</span>
          </div>
          <div className={`h-0.5 flex-1 mx-3 ${step >= 2 ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-800'}`} />
          <div className={`flex items-center gap-2 ${step >= 2 ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-400'}`}>
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>2</span>
            <span className="text-xs hidden sm:inline">Admin Account</span>
          </div>
          <div className={`h-0.5 flex-1 mx-3 ${step >= 3 ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-800'}`} />
          <div className={`flex items-center gap-2 ${step === 3 ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-400'}`}>
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${step === 3 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>3</span>
            <span className="text-xs hidden sm:inline">Review</span>
          </div>
        </div>

        {/* Step 1: Institution Details */}
        {step === 1 && (
          <div className="space-y-4 animate-fadeIn">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Step 1: Institution Details</h4>
            
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Institution Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Government Science College School"
                className={`input-field ${errors.name ? 'border-red-500' : ''}`}
              />
              {errors.name && <span className="text-xs text-red-500 mt-1 block">{errors.name}</span>}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Institution Code / EIIN (Numeric Slug) *</label>
              <input
                type="text"
                value={formData.slug}
                onChange={e => setFormData({ ...formData, slug: e.target.value.replace(/\D/g, '') })}
                placeholder="e.g. 102030"
                className={`input-field font-mono ${errors.slug ? 'border-red-500' : ''}`}
              />
              {errors.slug && <span className="text-xs text-red-500 mt-1 block">{errors.slug}</span>}
            </div>
          </div>
        )}

        {/* Step 2: Admin Account */}
        {step === 2 && (
          <div className="space-y-4 animate-fadeIn">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Step 2: Administrator Account Setup</h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">First Name *</label>
                <input
                  type="text"
                  value={formData.adminFirstName}
                  onChange={e => setFormData({ ...formData, adminFirstName: e.target.value })}
                  placeholder="First Name"
                  className={`input-field ${errors.adminFirstName ? 'border-red-500' : ''}`}
                />
                {errors.adminFirstName && <span className="text-xs text-red-500 mt-1 block">{errors.adminFirstName}</span>}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Last Name *</label>
                <input
                  type="text"
                  value={formData.adminLastName}
                  onChange={e => setFormData({ ...formData, adminLastName: e.target.value })}
                  placeholder="Last Name"
                  className={`input-field ${errors.adminLastName ? 'border-red-500' : ''}`}
                />
                {errors.adminLastName && <span className="text-xs text-red-500 mt-1 block">{errors.adminLastName}</span>}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Email Address *</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={formData.adminEmail}
                  onChange={e => setFormData({ ...formData, adminEmail: e.target.value })}
                  placeholder="admin@school.edu.bd"
                  className={`input-field pl-10 ${errors.adminEmail ? 'border-red-500' : ''}`}
                />
              </div>
              {errors.adminEmail && <span className="text-xs text-red-500 mt-1 block">{errors.adminEmail}</span>}
            </div>

            {/* Admin Password Setup */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl space-y-3">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Initial Admin Password *
                </label>
                <button
                  type="button"
                  onClick={generateRandomPassword}
                  className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 min-h-[32px]"
                >
                  <Wand2 className="w-3.5 h-3.5" /> Generate Password
                </button>
              </div>

              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.adminPassword}
                  onChange={e => setFormData({ ...formData, adminPassword: e.target.value })}
                  placeholder="Min 6 characters (or click Generate Password)"
                  className={`input-field pl-10 pr-10 text-xs ${errors.adminPassword ? 'border-red-500' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 min-h-[32px] min-w-[32px] flex items-center justify-center"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.adminPassword && <span className="text-xs text-red-500 block">{errors.adminPassword}</span>}

              <label className="flex items-center gap-3 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={sendInvitation}
                  onChange={e => setSendInvitation(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold">
                  Send welcome notification to admin email
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Step 3: Review & Confirm or Credentials Summary */}
        {createdSummary ? (
          <div className="space-y-6 animate-fadeIn">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Registration Complete!</h4>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  The institution and administrator account are ready. Save or copy these login credentials now.
                </p>
              </div>
            </div>

            <div className="p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-white/5 space-y-3">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Institution</span>
                <p className="text-base font-bold text-slate-900 dark:text-white">{createdSummary.name}</p>
                <p className="text-xs font-mono text-blue-600 dark:text-blue-400">EIIN / Code: {createdSummary.slug}</p>
              </div>

              <div className="border-t border-slate-200 dark:border-white/5 pt-3 space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Admin Login Credentials</span>
                <div>
                  <span className="text-xs text-slate-500 block">Email Address:</span>
                  <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">{createdSummary.adminEmail}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Password:</span>
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/20 inline-block">
                    {createdSummary.adminPassword}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-white/5">
              <button
                type="button"
                onClick={() => {
                  const text = `Institution: ${createdSummary.name}\nEIIN / Code: ${createdSummary.slug}\nAdmin Email: ${createdSummary.adminEmail}\nPassword: ${createdSummary.adminPassword}\nPortal Login URL: ${window.location.origin}/login`;
                  navigator.clipboard.writeText(text);
                  toast.success('Credentials copied to clipboard!');
                }}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md min-h-[44px]"
              >
                <Copy className="w-4 h-4" /> Copy All Credentials
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs min-h-[44px]"
              >
                Done
              </button>
            </div>
          </div>
        ) : step === 3 ? (
          <div className="space-y-4 animate-fadeIn">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Step 3: Review & Confirm</h4>
            
            <div className="p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-white/5 space-y-4">
              <div>
                <span className="text-xs text-slate-400 font-semibold block uppercase">Institution</span>
                <p className="text-base font-bold text-slate-900 dark:text-white">{formData.name}</p>
                <p className="text-xs font-mono text-blue-600 dark:text-blue-400">EIIN / Code: {formData.slug}</p>
              </div>

              <div className="border-t border-slate-200 dark:border-white/5 pt-3 space-y-2">
                <span className="text-xs text-slate-400 font-semibold block uppercase">Administrator Account</span>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{formData.adminFirstName} {formData.adminLastName}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">{formData.adminEmail}</p>
                <div>
                  <span className="text-xs text-slate-500 block">Initial Password:</span>
                  <span className="text-xs font-mono font-bold text-slate-900 dark:text-white bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">
                    {formData.adminPassword || '(Auto-generated)'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Action Controls */}
        {!createdSummary && (
          <div className="flex justify-between items-center pt-6 mt-6 border-t border-slate-200 dark:border-white/5">
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white min-h-[44px]"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            ) : <div />}

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-lg shadow-blue-500/20 transition-all min-h-[44px]"
              >
                Next Step <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-8 py-3 rounded-2xl font-bold text-sm shadow-xl shadow-emerald-500/20 transition-all disabled:opacity-50 min-h-[44px]"
              >
                <CheckCircle2 className="w-5 h-5" />
                {submitting ? 'Registering...' : 'Confirm & Complete Registration'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RegistrationWizard;
