import React from 'react';
import { Globe, Mail, Phone, MapPin } from 'lucide-react';

export interface PreviewConfig {
  heroTitle: string;
  heroSubtitle: string;
  aboutText: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
}

export interface PreviewTheme {
  bg: string;
}

/** The mocked public landing page, shared by the desktop and mobile preview frames. */
const PreviewBody: React.FC<{ config: PreviewConfig; theme: PreviewTheme }> = ({ config, theme }) => (
  <>
    {/* Site Header */}
    <nav className="bg-white px-4 sm:px-6 py-4 flex items-center justify-between shadow-xs sticky top-0 z-10">
      <div className="flex items-center gap-2">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm ${theme.bg}`}>
          P
        </span>
        <span className="font-bold text-base text-slate-900">PeopleIT School</span>
      </div>
      <div className="hidden sm:flex items-center gap-4 text-xs font-semibold text-slate-600">
        <span className="text-slate-900 cursor-pointer">Home</span>
        <span className="hover:text-slate-900 cursor-pointer">Admissions</span>
        <span className="hover:text-slate-900 cursor-pointer">Curriculum</span>
        <span className="hover:text-slate-900 cursor-pointer">Contact</span>
        <button className={`text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold ${theme.bg} transition-colors`}>
          Portal Login
        </button>
      </div>
    </nav>

    {/* Site Hero Banner */}
    <div className="relative bg-slate-950 text-white py-12 sm:py-16 px-5 sm:px-8 overflow-hidden">
      <div className="absolute inset-0 opacity-15 bg-grid-pattern pointer-events-none" />
      <div className={`absolute -right-16 -top-16 w-60 h-60 rounded-full blur-3xl opacity-30 ${theme.bg}`} />

      <div className="max-w-xl relative z-10 space-y-4">
        <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full text-white ${theme.bg}`}>
          Admissions Open 2026-27
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
          {config.heroTitle || 'Add title text...'}
        </h1>
        <p className="text-xs text-slate-300 leading-relaxed max-w-lg">{config.heroSubtitle || 'Add subtitle content...'}</p>
        <div className="flex gap-3 pt-2">
          <button className={`text-white font-semibold text-xs px-4 py-2 rounded-lg ${theme.bg}`}>Apply Online</button>
          <button className="bg-slate-900 hover:bg-slate-850 border border-slate-700 text-slate-200 font-semibold text-xs px-4 py-2 rounded-lg">
            Virtual Tour
          </button>
        </div>
      </div>
    </div>

    {/* About Us section */}
    <div className="bg-white py-10 sm:py-12 px-5 sm:px-8">
      <div className="max-w-2xl mx-auto space-y-3">
        <h2 className="text-lg font-bold text-slate-900 text-center flex items-center justify-center gap-2">
          <span className={`w-2 h-2 rounded-full ${theme.bg}`} />
          About Our Institution
        </h2>
        <p className="text-xs text-slate-600 leading-relaxed text-center font-normal">
          {config.aboutText || 'Add about body information...'}
        </p>
      </div>
    </div>

    {/* Contact section */}
    <div className="bg-slate-50 border-t border-slate-200 py-10 px-5 sm:px-8">
      <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="flex items-start gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 ${theme.bg}`}>
            <Mail className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900">Email Address</h4>
            <p className="text-[11px] text-slate-500 break-all mt-0.5">{config.contactEmail || 'N/A'}</p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 ${theme.bg}`}>
            <Phone className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900">Call Us</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">{config.contactPhone || 'N/A'}</p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 ${theme.bg}`}>
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-900">Campus Location</h4>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">{config.contactAddress || 'N/A'}</p>
          </div>
        </div>
      </div>
    </div>

    {/* Site Footer */}
    <footer className="bg-slate-900 text-slate-400 text-[10px] text-center py-4 border-t border-slate-800">
      <p>&copy; 2026 PeopleIT School. All Rights Reserved. Custom Web Design Preview.</p>
    </footer>
  </>
);

/** Desktop browser-window mock, or a narrow phone-frame mock — same body either way. */
export const WebsitePreview: React.FC<{
  config: PreviewConfig;
  theme: PreviewTheme;
  mode: 'desktop' | 'mobile';
}> = ({ config, theme, mode }) => (
  <div
    className={`mx-auto bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col h-[680px] transition-[max-width] duration-200 ${
      mode === 'mobile' ? 'max-w-[380px]' : 'max-w-none'
    }`}
  >
    {/* Window/device chrome */}
    <div className="bg-slate-100 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-2 shrink-0">
      <div className="flex gap-1.5">
        <span className="w-3 h-3 rounded-full bg-red-500/40 block" />
        <span className="w-3 h-3 rounded-full bg-yellow-500/40 block" />
        <span className="w-3 h-3 rounded-full bg-green-500/40 block" />
      </div>
      <div className="bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 rounded-lg text-[10px] text-slate-600 dark:text-slate-500 px-3 py-1 flex items-center gap-1.5 w-64 mx-auto truncate select-none">
        <Globe className="w-3 h-3 text-slate-400 dark:text-slate-600 shrink-0" />
        <span>https://www.peopleit-school.edu</span>
      </div>
    </div>

    {/* Page body */}
    <div className="flex-1 overflow-y-auto bg-slate-950 text-slate-800 selection:bg-slate-200">
      <PreviewBody config={config} theme={theme} />
    </div>
  </div>
);
