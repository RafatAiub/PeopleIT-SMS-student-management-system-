import React, { useState, useEffect } from 'react';
import { ShieldAlert, LogOut, Eye, Clock } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

export const SupportBanner: React.FC = () => {
  const { supportSession, exitSupportSession } = useAuthStore();
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    if (!supportSession) return;

    const updateTimer = () => {
      const remaining = Math.max(0, Math.floor((supportSession.expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        toast.error('Support session expired. Returning to Super Admin view.');
        exitSupportSession();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [supportSession, exitSupportSession]);

  if (!supportSession) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  return (
    <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white px-4 py-2.5 shadow-md flex items-center justify-between z-50 text-xs sm:text-sm font-medium animate-fadeIn">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-black/20 px-2.5 py-1 rounded-lg border border-white/20 font-bold uppercase tracking-wide text-[11px]">
          <ShieldAlert className="w-4 h-4 text-amber-200" />
          <span>Support Access Mode</span>
        </div>

        <div className="flex items-center gap-2">
          <span>Viewing as:</span>
          <strong className="underline decoration-white/40">
            {supportSession.targetUser.firstName} {supportSession.targetUser.lastName} ({supportSession.targetUser.role})
          </strong>
        </div>

        <span className="hidden md:inline text-white/60">•</span>

        <div className="hidden sm:flex items-center gap-1">
          <span>Institution:</span>
          <span className="font-bold">{supportSession.institution.name} ({supportSession.institution.slug})</span>
        </div>

        <span className="hidden md:inline text-white/60">•</span>

        <div className="flex items-center gap-1 bg-black/20 px-2 py-0.5 rounded-sm text-amber-100 font-semibold">
          <Eye className="w-3.5 h-3.5" />
          <span>{supportSession.isReadOnly ? 'Read-Only' : 'Full Control'}</span>
        </div>

        <div className="flex items-center gap-1 text-amber-100 font-mono bg-black/30 px-2 py-0.5 rounded-sm">
          <Clock className="w-3.5 h-3.5" />
          <span>Expires in {timeFormatted}</span>
        </div>
      </div>

      <button
        onClick={() => {
          exitSupportSession();
          toast.success('Exited support session');
        }}
        className="flex items-center gap-1.5 bg-white text-slate-900 hover:bg-amber-50 px-3 py-1.5 rounded-xl font-bold transition-all shadow-xs active:scale-95 text-xs min-h-[44px]"
        title="Exit support session and return to Super Admin view"
      >
        <LogOut className="w-4 h-4 text-amber-700" />
        <span>Exit Support Mode</span>
      </button>
    </div>
  );
};

export default SupportBanner;
