import React, { useState } from 'react';
import { CheckCircle2, ChevronRight, ChevronLeft, Mail, Lock, Eye, EyeOff, Copy, Wand2, Check } from 'lucide-react';
import apiClient from '@/api/client';
import toast from 'react-hot-toast';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Checkbox } from '../ui/Input';
import { cn } from '../../lib/cn';

interface RegistrationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface CreatedSummary {
  name: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
}

const STEPS = [
  { id: 1, label: 'Institution' },
  { id: 2, label: 'Admin account' },
  { id: 3, label: 'Review' },
];

const StepIndicator: React.FC<{ step: number }> = ({ step }) => (
  <div className="flex items-center justify-between mb-8">
    {STEPS.map((s, i) => (
      <React.Fragment key={s.id}>
        <div className={cn('flex items-center gap-2', step >= s.id ? 'text-primary-700 dark:text-primary-300 font-semibold' : 'text-slate-400')}>
          <span
            className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0',
              step >= s.id ? 'bg-primary-600 text-white' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            )}
          >
            {step > s.id ? <Check className="w-3.5 h-3.5" /> : s.id}
          </span>
          <span className="text-xs hidden sm:inline">{s.label}</span>
        </div>
        {i < STEPS.length - 1 && <div className={cn('h-0.5 flex-1 mx-3', step > s.id ? 'bg-primary-600' : 'bg-slate-200 dark:bg-slate-800')} />}
      </React.Fragment>
    ))}
  </div>
);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const RegistrationWizard: React.FC<RegistrationWizardProps> = ({ isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sendInvitation, setSendInvitation] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [createdSummary, setCreatedSummary] = useState<CreatedSummary | null>(null);

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

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData((prev) => ({ ...prev, adminPassword: pwd }));
    setShowPassword(true);
    toast.success('Generated initial admin password!');
  };

  const validateStep1 = () => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim() || formData.name.trim().length < 2) {
      errs.name = 'Institution name must be at least 2 characters';
    }
    if (!formData.slug.trim() || !/^\d+$/.test(formData.slug.trim())) {
      errs.slug = 'Institution code / EIIN must be a numeric value';
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

      toast.success('Institution and administrator registered successfully!');
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to register institution');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Register sub-institution"
      description="3-step onboarding wizard"
      size="xl"
    >
      <StepIndicator step={step} />

      {/* Step 1: Institution details */}
      {step === 1 && (
        <div className="space-y-4 animate-fadeIn">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wide">Step 1: Institution details</h4>

          <Input
            label="Institution name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Government Science College School"
            error={errors.name}
            autoFocus
          />

          <Input
            label="Institution code / EIIN (numeric)"
            required
            value={formData.slug}
            onChange={(e) => setFormData({ ...formData, slug: e.target.value.replace(/\D/g, '') })}
            placeholder="e.g. 102030"
            className="font-mono"
            error={errors.slug}
          />
        </div>
      )}

      {/* Step 2: Admin account */}
      {step === 2 && (
        <div className="space-y-4 animate-fadeIn">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wide">Step 2: Administrator account setup</h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="First name"
              required
              value={formData.adminFirstName}
              onChange={(e) => setFormData({ ...formData, adminFirstName: e.target.value })}
              placeholder="First name"
              error={errors.adminFirstName}
            />
            <Input
              label="Last name"
              required
              value={formData.adminLastName}
              onChange={(e) => setFormData({ ...formData, adminLastName: e.target.value })}
              placeholder="Last name"
              error={errors.adminLastName}
            />
          </div>

          <Input
            label="Email address"
            required
            type="email"
            value={formData.adminEmail}
            onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
            placeholder="admin@school.edu.bd"
            leftIcon={<Mail className="w-4 h-4" />}
            error={errors.adminEmail}
          />

          {/* Admin password setup */}
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-2xl space-y-3">
            <div className="flex justify-between items-center">
              <span className="field-label mb-0">Initial admin password</span>
              <button
                type="button"
                onClick={generateRandomPassword}
                className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 min-h-[32px]"
              >
                <Wand2 className="w-3.5 h-3.5" /> Generate password
              </button>
            </div>

            <Input
              type={showPassword ? 'text' : 'password'}
              value={formData.adminPassword}
              onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
              placeholder="Min 6 characters (or click Generate Password)"
              leftIcon={<Lock className="w-4 h-4" />}
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 min-h-[32px] min-w-[32px] flex items-center justify-center"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
              error={errors.adminPassword}
              className="font-mono text-xs"
            />

            <Checkbox
              checked={sendInvitation}
              onChange={(e) => setSendInvitation(e.target.checked)}
              label="Send welcome notification to admin email"
            />
          </div>
        </div>
      )}

      {/* Step 3: Review & confirm, or credentials summary */}
      {createdSummary ? (
        <div className="space-y-6 animate-fadeIn">
          <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">Registration complete!</h4>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                The institution and administrator account are ready. Save or copy these login credentials now.
              </p>
            </div>
          </div>

          <div className="p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-white/5 space-y-3">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide block">Institution</span>
              <p className="text-base font-bold text-slate-900 dark:text-white">{createdSummary.name}</p>
              <p className="text-xs font-mono text-blue-600 dark:text-blue-400">EIIN / Code: {createdSummary.slug}</p>
            </div>

            <div className="border-t border-slate-200 dark:border-white/5 pt-3 space-y-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide block">Admin login credentials</span>
              <div>
                <span className="text-xs text-slate-500 block">Email address:</span>
                <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">{createdSummary.adminEmail}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Password:</span>
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-sm border border-emerald-200 dark:border-emerald-500/20 inline-block">
                  {createdSummary.adminPassword}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-white/5">
            <Button
              variant="gradient"
              onClick={() => {
                const text = `Institution: ${createdSummary.name}\nEIIN / Code: ${createdSummary.slug}\nAdmin Email: ${createdSummary.adminEmail}\nPassword: ${createdSummary.adminPassword}\nPortal Login URL: ${window.location.origin}/login`;
                navigator.clipboard.writeText(text);
                toast.success('Credentials copied to clipboard!');
              }}
            >
              <Copy className="w-4 h-4" /> Copy all credentials
            </Button>
            <Button variant="secondary" onClick={handleClose}>Done</Button>
          </div>
        </div>
      ) : step === 3 ? (
        <div className="space-y-4 animate-fadeIn">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wide">Step 3: Review &amp; confirm</h4>

          <div className="p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-white/5 space-y-4">
            <div>
              <span className="text-xs text-slate-400 font-semibold block uppercase">Institution</span>
              <p className="text-base font-bold text-slate-900 dark:text-white">{formData.name}</p>
              <p className="text-xs font-mono text-blue-600 dark:text-blue-400">EIIN / Code: {formData.slug}</p>
            </div>

            <div className="border-t border-slate-200 dark:border-white/5 pt-3 space-y-2">
              <span className="text-xs text-slate-400 font-semibold block uppercase">Administrator account</span>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{formData.adminFirstName} {formData.adminLastName}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">{formData.adminEmail}</p>
              <div>
                <span className="text-xs text-slate-500 block">Initial password:</span>
                <span className="text-xs font-mono font-bold text-slate-900 dark:text-white bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-sm">
                  {formData.adminPassword || '(Auto-generated)'}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Action controls */}
      {!createdSummary && (
        <div className="flex justify-between items-center pt-6 mt-6 border-t border-slate-200 dark:border-white/5">
          {step > 1 ? (
            <Button type="button" variant="ghost" onClick={handleBack} leftIcon={<ChevronLeft className="w-4 h-4" />}>
              Back
            </Button>
          ) : <div />}

          {step < 3 ? (
            <Button type="button" variant="gradient" onClick={handleNext} rightIcon={<ChevronRight className="w-4 h-4" />}>
              Next step
            </Button>
          ) : (
            <Button type="button" variant="gradient" isLoading={submitting} onClick={handleSubmit} leftIcon={<CheckCircle2 className="w-4 h-4" />}>
              Confirm &amp; complete registration
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
};

export default RegistrationWizard;
