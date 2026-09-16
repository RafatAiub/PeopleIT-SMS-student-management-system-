import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, User, Mail, Phone, MapPin, MessageSquare, CheckCircle2, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { institutionApplicationApi } from '../../api/institutionApplication.api';
import { LogoMark } from '../../components/common/LogoMark';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateBDMobileNumber = (phone: string): string | null => {
  if (!phone.trim()) return null;

  const digitsOnly = phone.replace(/\D/g, '');

  if (digitsOnly.length < 11) {
    return 'Mobile number must have at least 11 digits (e.g., 01700000000)';
  }

  if (digitsOnly.length > 13) {
    return 'Mobile number cannot exceed 13 digits';
  }

  const has01 = /^01[0-9]{9}$/.test(digitsOnly);
  const has8801 = /^8801[0-9]{9}$/.test(digitsOnly);

  if (!has01 && !has8801) {
    return 'Enter a valid BD mobile number (01XXXXXXXXX or +8801XXXXXXXXX)';
  }

  const secondDigit = has01 ? digitsOnly[2] : digitsOnly[3];
  const validOperators = ['0', '2', '3', '4', '5', '6', '7', '8', '9'];

  if (!validOperators.includes(secondDigit)) {
    return 'Invalid operator. Valid BD operators: GP(017), BL(018), Robi(016), Airtel(016), TeletalkBD(015)';
  }

  return null;
};

const validateInstitutionPhone = (phone: string): string | null => {
  if (!phone.trim()) return null;

  const digitsOnly = phone.replace(/\D/g, '');

  if (digitsOnly.length < 7) {
    return 'Phone number must have at least 7 digits';
  }

  if (!/^[\+]?[0-9\s()\-]*$/.test(phone)) {
    return 'Phone number can only contain digits, +, -, (), and spaces';
  }

  if (phone.length > 25) {
    return 'Phone number is too long';
  }

  return null;
};

const validateInstitutionName = (name: string): string | null => {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length < 2) return 'Institution name must be at least 2 characters';
  if (trimmed.length > 200) return 'Institution name must not exceed 200 characters';
  if (!/^[a-zA-Z0-9\s\-&.,()]*$/.test(trimmed)) return 'Institution name contains invalid characters';
  return null;
};

const validateEIIN = (eiin: string): string | null => {
  const trimmed = eiin.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return 'Institution Code / EIIN must be numeric';
  if (trimmed.length < 4 || trimmed.length > 10) return 'Institution Code / EIIN must be 4-10 digits';
  return null;
};

const validateName = (name: string, fieldName: string): string | null => {
  const trimmed = name.trim();
  if (!trimmed) return `${fieldName} is required`;
  if (trimmed.length > 100) return `${fieldName} must not exceed 100 characters`;
  if (!/^[a-zA-Z\s\-']*$/.test(trimmed)) {
    return `${fieldName} should only contain letters, spaces, hyphens, and apostrophes`;
  }
  return null;
};

const ApplyInstitution = () => {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    institutionName: '',
    slug: '',
    address: '',
    phone: '',
    applicantFirstName: '',
    applicantLastName: '',
    applicantEmail: '',
    applicantPhone: '',
    message: '',
  });

  const validate = () => {
    const errs: Record<string, string> = {};

    const institutionNameError = validateInstitutionName(formData.institutionName);
    if (institutionNameError) errs.institutionName = institutionNameError;

    const eeinError = validateEIIN(formData.slug);
    if (eeinError) errs.slug = eeinError;

    const firstNameError = validateName(formData.applicantFirstName, 'First name');
    if (firstNameError) errs.applicantFirstName = firstNameError;

    const lastNameError = validateName(formData.applicantLastName, 'Last name');
    if (lastNameError) errs.applicantLastName = lastNameError;

    if (!formData.applicantEmail.trim() || !EMAIL_PATTERN.test(formData.applicantEmail.trim())) {
      errs.applicantEmail = 'Please enter a valid email address (e.g., name@example.com)';
    }

    const phoneError = validateInstitutionPhone(formData.phone);
    if (phoneError) errs.phone = phoneError;

    const applicantPhoneError = validateBDMobileNumber(formData.applicantPhone);
    if (applicantPhoneError) errs.applicantPhone = applicantPhoneError;

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await institutionApplicationApi.submit({
        institutionName: formData.institutionName.trim(),
        slug: formData.slug.trim(),
        address: formData.address.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        applicantFirstName: formData.applicantFirstName.trim(),
        applicantLastName: formData.applicantLastName.trim(),
        applicantEmail: formData.applicantEmail.trim().toLowerCase(),
        applicantPhone: formData.applicantPhone.trim() || undefined,
        message: formData.message.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err: any) {
      if (err.response?.status === 401) {
        const message = err.response?.data?.message || "This email isn't authorized to apply yet.";
        toast.error(
          <span>
            {message}{' '}
            <a href="mailto:sales@peopleit.io" className="underline font-semibold">
              Email sales@peopleit.io
            </a>
          </span>,
          { duration: 8000 },
        );
      } else {
        toast.error(err.response?.data?.message || 'Failed to submit application');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-surface-900 flex items-center justify-center p-4 transition-colors duration-300">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary-500/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/20 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-lg animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="text-center mb-8">
          <LogoMark className="w-14 h-14 mx-auto mb-4 shadow-lg" />
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white mb-2">
            Register Your Institution
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">
            Apply to join PeopleNIT SMS — our team will review your application
          </p>
        </div>

        <div className="glass-card p-6 sm:p-8 relative overflow-hidden animate-fadeIn">
          {submitted ? (
            <div className="text-center py-6 space-y-4">
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Application Submitted!</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
                Thank you. Our Super Admin will review your application and contact{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-200">{formData.applicantEmail}</span> with
                your login credentials once it's approved.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline mt-2"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Institution Details
              </h3>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Institution Name *</label>
                <div className="relative">
                  <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={formData.institutionName}
                    onChange={(e) => setFormData({ ...formData, institutionName: e.target.value })}
                    placeholder="e.g. Government Science College"
                    className={`input-field pl-10 ${errors.institutionName ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.institutionName && <span className="text-xs text-red-500 mt-1 block">{errors.institutionName}</span>}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Institution Code / EIIN *</label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.replace(/\D/g, '') })}
                  placeholder="e.g. 102030"
                  className={`input-field font-mono ${errors.slug ? 'border-red-500' : ''}`}
                />
                {errors.slug && <span className="text-xs text-red-500 mt-1 block">{errors.slug}</span>}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Address</label>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="City, District"
                    className="input-field pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Institution Phone</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="e.g., +880-2-1234567 or 02-1234567"
                    className={`input-field pl-10 ${errors.phone ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.phone ? (
                  <span className="text-xs text-red-500 mt-1 block">{errors.phone}</span>
                ) : (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Landline or mobile with area code (7+ digits)
                  </p>
                )}
              </div>

              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pt-2">
                Your Contact Details
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">First Name *</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={formData.applicantFirstName}
                      onChange={(e) => setFormData({ ...formData, applicantFirstName: e.target.value })}
                      placeholder="First Name"
                      className={`input-field pl-10 ${errors.applicantFirstName ? 'border-red-500' : ''}`}
                    />
                  </div>
                  {errors.applicantFirstName && <span className="text-xs text-red-500 mt-1 block">{errors.applicantFirstName}</span>}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={formData.applicantLastName}
                    onChange={(e) => setFormData({ ...formData, applicantLastName: e.target.value })}
                    placeholder="Last Name"
                    className={`input-field ${errors.applicantLastName ? 'border-red-500' : ''}`}
                  />
                  {errors.applicantLastName && <span className="text-xs text-red-500 mt-1 block">{errors.applicantLastName}</span>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Email Address *</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={formData.applicantEmail}
                    onChange={(e) => setFormData({ ...formData, applicantEmail: e.target.value })}
                    placeholder="you@school.edu.bd"
                    className={`input-field pl-10 ${errors.applicantEmail ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.applicantEmail && <span className="text-xs text-red-500 mt-1 block">{errors.applicantEmail}</span>}
                <p className="text-[11px] text-slate-500 mt-1">
                  We'll contact you here with your login credentials once your application is approved.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Your Mobile Number *</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={formData.applicantPhone}
                    onChange={(e) => setFormData({ ...formData, applicantPhone: e.target.value })}
                    placeholder="01700000000 or +8801700000000"
                    className={`input-field pl-10 ${errors.applicantPhone ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.applicantPhone ? (
                  <span className="text-xs text-red-500 mt-1 block">{errors.applicantPhone}</span>
                ) : (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Bangladesh mobile number (e.g., 01700000000 or +8801700000000)
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Message (optional)</label>
                <div className="relative">
                  <MessageSquare className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <textarea
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Anything else you'd like us to know?"
                    rows={3}
                    className="input-field pl-10 resize-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full justify-center py-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting…' : 'Submit Application'}
              </button>

              <p className="text-center">
                <Link to="/login" className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                  Already have an account? Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApplyInstitution;
