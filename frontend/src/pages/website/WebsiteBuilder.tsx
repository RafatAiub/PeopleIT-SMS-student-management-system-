import React, { useState } from 'react';
import { Layout, Palette, Type, Info, Mail, Phone, MapPin, Globe, Save, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

interface CustomizerConfig {
  themeColor: string;
  heroTitle: string;
  heroSubtitle: string;
  aboutText: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
}

export default function WebsiteBuilder() {
  const [config, setConfig] = useState<CustomizerConfig>({
    themeColor: 'indigo',
    heroTitle: 'Empowering Next-Gen Leaders',
    heroSubtitle: 'Welcome to PeopleIT School, where academic excellence meets innovative character building and core skill development.',
    aboutText: 'Established in 2012, PeopleIT School has been a pioneer in student-first educational paradigms. We provide top-tier facilities, dedicated educational mentors, and a robust learning environment suited for the digital age.',
    contactEmail: 'admissions@peopleit-school.edu',
    contactPhone: '+880 2-9876543',
    contactAddress: 'Plot 42, Road 11, Banani, Dhaka, Bangladesh',
  });

  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success('Landing page visual configuration published successfully!');
    }, 1000);
  };

  // Color theme classes mapped from state selection
  const themeColorsMap: Record<string, { bg: string; text: string; border: string; btn: string; banner: string }> = {
    indigo: {
      bg: 'bg-indigo-600',
      text: 'text-indigo-400',
      border: 'border-indigo-500',
      btn: 'bg-indigo-600 hover:bg-indigo-700',
      banner: 'from-indigo-650 to-indigo-900',
    },
    emerald: {
      bg: 'bg-emerald-600',
      text: 'text-emerald-400',
      border: 'border-emerald-500',
      btn: 'bg-emerald-600 hover:bg-emerald-700',
      banner: 'from-emerald-650 to-emerald-900',
    },
    blue: {
      bg: 'bg-blue-600',
      text: 'text-blue-400',
      border: 'border-blue-500',
      btn: 'bg-blue-600 hover:bg-blue-700',
      banner: 'from-blue-650 to-blue-900',
    },
    rose: {
      bg: 'bg-rose-600',
      text: 'text-rose-400',
      border: 'border-rose-500',
      btn: 'bg-rose-600 hover:bg-rose-700',
      banner: 'from-rose-650 to-rose-900',
    },
    amber: {
      bg: 'bg-amber-650',
      text: 'text-amber-400',
      border: 'border-amber-500',
      btn: 'bg-amber-600 hover:bg-amber-700',
      banner: 'from-amber-650 to-amber-900',
    },
  };

  const selectedTheme = themeColorsMap[config.themeColor] || themeColorsMap.indigo;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Layout className="w-7 h-7 text-indigo-500 dark:text-indigo-400" />
            Landing Page Customizer
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Configure the public-facing landing page of your institution and preview edits instantly.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm font-semibold active:scale-[0.98] disabled:opacity-50 self-start sm:self-auto"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Publishing...' : 'Publish Changes'}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Side: Inputs visual configuration */}
        <div className="xl:col-span-5 space-y-6">
          <div className="glass-card p-6 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-transparent shadow-sm space-y-4">
            <h3 className="text-md font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Palette className="w-4.5 h-4.5 text-indigo-650 dark:text-indigo-400" />
              Theme &amp; Brand Styling
            </h3>

            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1.5 block">Theme Color Accent</label>
              <div className="flex gap-2">
                {Object.keys(themeColorsMap).map((colorName) => (
                  <button
                    key={colorName}
                    type="button"
                    onClick={() => setConfig(prev => ({ ...prev, themeColor: colorName }))}
                    className={`w-8 h-8 rounded-full border-2 transition-all relative ${
                      config.themeColor === colorName
                        ? 'border-slate-800 dark:border-white scale-110 shadow-lg'
                        : 'border-transparent opacity-60 hover:opacity-100 hover:scale-105'
                    }`}
                    style={{
                      backgroundColor:
                        colorName === 'indigo'
                          ? '#4f46e5'
                          : colorName === 'emerald'
                          ? '#059669'
                          : colorName === 'blue'
                          ? '#2563eb'
                          : colorName === 'rose'
                          ? '#e11d48'
                          : '#d97706',
                    }}
                    title={`Theme color ${colorName}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-transparent shadow-sm space-y-4">
            <h3 className="text-md font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Type className="w-4.5 h-4.5 text-indigo-650 dark:text-indigo-400" />
              Hero Section Text
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1 block">Hero Main Title</label>
                <input
                  type="text"
                  value={config.heroTitle}
                  onChange={e => setConfig(prev => ({ ...prev, heroTitle: e.target.value }))}
                  className="input-field"
                  placeholder="E.g. Building Tomorrow's Leaders"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1 block">Hero Subtitle</label>
                <textarea
                  rows={3}
                  value={config.heroSubtitle}
                  onChange={e => setConfig(prev => ({ ...prev, heroSubtitle: e.target.value }))}
                  className="input-field resize-none"
                  placeholder="Enter a brief tag description"
                />
              </div>
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-transparent shadow-sm space-y-4">
            <h3 className="text-md font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Info className="w-4.5 h-4.5 text-indigo-650 dark:text-indigo-400" />
              About Institution Section
            </h3>

            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1 block">About Us Body Text</label>
              <textarea
                rows={4}
                value={config.aboutText}
                onChange={e => setConfig(prev => ({ ...prev, aboutText: e.target.value }))}
                className="input-field resize-none"
                placeholder="Institutional profile information"
              />
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-slate-200/50 dark:border-white/5 bg-white dark:bg-transparent shadow-sm space-y-4">
            <h3 className="text-md font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Phone className="w-4.5 h-4.5 text-indigo-650 dark:text-indigo-400" />
              Contact Information
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1.5 block">Official Email Address</label>
                <input
                  type="email"
                  value={config.contactEmail}
                  onChange={e => setConfig(prev => ({ ...prev, contactEmail: e.target.value }))}
                  className="input-field"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1.5 block">Contact Hotline</label>
                <input
                  type="text"
                  value={config.contactPhone}
                  onChange={e => setConfig(prev => ({ ...prev, contactPhone: e.target.value }))}
                  className="input-field"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1.5 block">Campus Address</label>
                <input
                  type="text"
                  value={config.contactAddress}
                  onChange={e => setConfig(prev => ({ ...prev, contactAddress: e.target.value }))}
                  className="input-field"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Responsive Desktop Preview Mock */}
        <div className="xl:col-span-7 space-y-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wide uppercase px-1">Live Web Preview (Desktop Mock)</span>
          
          <div className="bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[680px]">
            {/* Desktop window controls bar */}
            <div className="bg-slate-100 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-500/40 block" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/40 block" />
                <span className="w-3 h-3 rounded-full bg-green-500/40 block" />
              </div>
              <div className="bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 rounded-lg text-[10px] text-slate-600 dark:text-slate-500 px-3 py-1 flex items-center gap-1.5 w-64 mx-auto truncate select-none">
                <Globe className="w-3 h-3 text-slate-405 dark:text-slate-600 flex-shrink-0" />
                <span>https://www.peopleit-school.edu</span>
              </div>
            </div>

            {/* Desktop page body wrapper */}
            <div className="flex-1 overflow-y-auto bg-slate-950 text-slate-800 selection:bg-slate-200">
              
              {/* Site Header */}
              <nav className="bg-white px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm ${selectedTheme.bg}`}>
                    P
                  </span>
                  <span className="font-bold text-base text-slate-900">PeopleIT School</span>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
                  <span className="text-slate-900 cursor-pointer">Home</span>
                  <span className="hover:text-slate-900 cursor-pointer">Admissions</span>
                  <span className="hover:text-slate-900 cursor-pointer">Curriculum</span>
                  <span className="hover:text-slate-900 cursor-pointer">Contact</span>
                  <button className={`text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold ${selectedTheme.bg} transition-colors`}>
                    Portal Login
                  </button>
                </div>
              </nav>

              {/* Site Hero Banner */}
              <div className="relative bg-slate-950 text-white py-16 px-8 overflow-hidden">
                <div className="absolute inset-0 opacity-15 bg-grid-pattern pointer-events-none" />
                
                {/* Visual gradient blob based on chosen theme */}
                <div className={`absolute -right-16 -top-16 w-60 h-60 rounded-full blur-3xl opacity-30 ${selectedTheme.bg}`} />
                
                <div className="max-w-xl relative z-10 space-y-4">
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full text-white ${selectedTheme.bg}`}>
                    Admissions Open 2026-27
                  </span>
                  <h1 className="text-3xl font-extrabold tracking-tight text-white leading-tight">
                    {config.heroTitle || 'Add title text...'}
                  </h1>
                  <p className="text-xs text-slate-300 leading-relaxed max-w-lg">
                    {config.heroSubtitle || 'Add subtitle content...'}
                  </p>
                  <div className="flex gap-3 pt-2">
                    <button className={`text-white font-semibold text-xs px-4 py-2 rounded-lg ${selectedTheme.bg}`}>
                      Apply Online
                    </button>
                    <button className="bg-slate-900 hover:bg-slate-850 border border-slate-700 text-slate-205 font-semibold text-xs px-4 py-2 rounded-lg">
                      Virtual Tour
                    </button>
                  </div>
                </div>
              </div>

              {/* About Us section */}
              <div className="bg-white py-12 px-8">
                <div className="max-w-2xl mx-auto space-y-3">
                  <h2 className="text-lg font-bold text-slate-900 text-center flex items-center justify-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${selectedTheme.bg}`} />
                    About Our Institution
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed text-center font-normal">
                    {config.aboutText || 'Add about body information...'}
                  </p>
                </div>
              </div>

              {/* Contact section */}
              <div className="bg-slate-50 border-t border-slate-200 py-10 px-8">
                <div className="max-w-2xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  <div className="flex items-start gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0 ${selectedTheme.bg}`}>
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Email Address</h4>
                      <p className="text-[11px] text-slate-500 break-all mt-0.5">{config.contactEmail || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0 ${selectedTheme.bg}`}>
                      <Phone className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Call Us</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">{config.contactPhone || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0 ${selectedTheme.bg}`}>
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

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
