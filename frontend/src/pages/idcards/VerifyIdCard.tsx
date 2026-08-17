import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, ShieldQuestion } from 'lucide-react';
import apiClient from '../../api/client';
import { LogoMark } from '../../components/common/LogoMark';

interface PublicVerifyInfo {
  institution: { name: string; logoUrl: string | null };
  holderName: string;
  holderPhoto: string | null;
  classOrDesignation: string;
  cardNumber: string;
  status: 'ACTIVE' | 'REVOKED';
  issuedAt: string;
  expiresAt: string | null;
}

// Public, unauthenticated page reached by scanning the QR code on a physical
// ID card — must render correctly with no logged-in session. apiClient's
// request interceptor only attaches an Authorization header when a token
// exists in the auth store; when none exists it's simply omitted, and the
// backend route (idcard.public.routes.ts) has no auth middleware anyway, so
// this works identically logged in or logged out.
export default function VerifyIdCard() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<PublicVerifyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    apiClient
      .get(`/id-cards/verify/${token}`)
      .then((res) => {
        if (!cancelled) setInfo(res.data.data);
      })
      .catch(() => {
        // Deliberately don't distinguish 404 vs 500 to the visitor — a bad
        // token and a server hiccup should look the same from the outside.
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const isExpired = info?.expiresAt ? new Date(info.expiresAt) < new Date() : false;
  const isValid = info?.status === 'ACTIVE' && !isExpired;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-surface-900 flex items-center justify-center p-4 transition-colors duration-300">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/20 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {loading ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500" />
            <p className="text-slate-500 dark:text-slate-400 text-sm">Verifying ID card...</p>
          </div>
        ) : notFound || !info ? (
          <div className="bg-white dark:bg-surface-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mx-auto">
              <ShieldQuestion className="w-8 h-8 text-slate-400" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">This ID card could not be verified</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              The link may be invalid or the card may no longer exist. Please contact the issuing institution if you believe this is a mistake.
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-surface-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-6 text-center border-b border-slate-100 dark:border-white/5">
              {info.institution.logoUrl ? (
                <img src={info.institution.logoUrl} alt={info.institution.name} className="w-12 h-12 rounded-lg object-contain mx-auto mb-3 bg-white border border-slate-200" />
              ) : (
                <LogoMark className="w-12 h-12 mx-auto mb-3" />
              )}
              <p className="text-sm font-bold text-slate-900 dark:text-white">{info.institution.name}</p>
            </div>

            <div className="p-6 flex flex-col items-center gap-3">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-slate-100 dark:border-white/10 bg-slate-100 flex-shrink-0">
                {info.holderPhoto ? (
                  <img src={info.holderPhoto} alt={info.holderName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">No Photo</div>
                )}
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-slate-900 dark:text-white">{info.holderName}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{info.classOrDesignation}</p>
                <p className="text-xs font-mono text-slate-400 dark:text-slate-500 mt-1">{info.cardNumber}</p>
              </div>
            </div>

            <div className={`px-6 py-4 flex items-center justify-center gap-2 font-bold text-sm ${isValid ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
              {isValid ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
              {isValid ? 'Valid ID Card' : isExpired ? 'Expired ID Card' : 'Revoked ID Card'}
            </div>

            <div className="px-6 py-3 text-center text-[11px] text-slate-400 dark:text-slate-500">
              Issued {new Date(info.issuedAt).toLocaleDateString()}
              {info.expiresAt && ` · Expires ${new Date(info.expiresAt).toLocaleDateString()}`}
            </div>
          </div>
        )}

        <p className="text-center mt-6">
          <Link to="/login" className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            Go to PeopleIT SMS login
          </Link>
        </p>
      </div>
    </div>
  );
}
