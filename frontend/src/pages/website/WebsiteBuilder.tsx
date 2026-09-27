import React, { useEffect, useState } from 'react';
import { Palette, Type, Info, Phone, Save, Monitor, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader, Button, Input, Textarea, Skeleton, ErrorState } from '@/components/ui';
import { useInstitutionWebsite, useUpdateInstitutionWebsite } from './website.queries';
import { WebsitePreview } from './WebsitePreview';

interface CustomizerConfig {
  themeColor: string;
  heroTitle: string;
  heroSubtitle: string;
  aboutText: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
}

// Named swatches map to the hex values actually persisted by the backend
// (Institution.themeColor is a strict #RRGGBB/#RGB string, not a color name).
const THEME_SWATCHES: Record<
  string,
  { hex: string; bg: string }
> = {
  indigo: { hex: '#4f46e5', bg: 'bg-indigo-600' },
  emerald: { hex: '#059669', bg: 'bg-emerald-600' },
  blue: { hex: '#2563eb', bg: 'bg-blue-600' },
  rose: { hex: '#e11d48', bg: 'bg-rose-600' },
  amber: { hex: '#d97706', bg: 'bg-amber-600' },
};

const DEFAULT_CONFIG: CustomizerConfig = {
  themeColor: THEME_SWATCHES.indigo.hex,
  heroTitle: 'Empowering Next-Gen Leaders',
  heroSubtitle: 'Welcome to PeopleIT School, where academic excellence meets innovative character building and core skill development.',
  aboutText: 'Established in 2012, PeopleIT School has been a pioneer in student-first educational paradigms. We provide top-tier facilities, dedicated educational mentors, and a robust learning environment suited for the digital age.',
  contactEmail: 'admissions@peopleit-school.edu',
  contactPhone: '+880 2-9876543',
  contactAddress: 'Plot 42, Road 11, Banani, Dhaka, Bangladesh',
};

export default function WebsiteBuilder() {
  const { data, isLoading, isError, refetch } = useInstitutionWebsite();
  const update = useUpdateInstitutionWebsite();

  const [config, setConfig] = useState<CustomizerConfig>(DEFAULT_CONFIG);
  const [hydrated, setHydrated] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  useEffect(() => {
    if (data && !hydrated) {
      setConfig((prev) => ({
        ...prev,
        themeColor: data.themeColor || prev.themeColor,
        heroTitle: data.heroTitle ?? prev.heroTitle,
        heroSubtitle: data.heroSubtitle ?? prev.heroSubtitle,
        aboutText: data.aboutText ?? prev.aboutText,
        contactEmail: data.contactEmail ?? prev.contactEmail,
        contactPhone: data.contactPhone ?? prev.contactPhone,
        // contactAddress isn't part of the website-config API/schema yet —
        // kept as local preview-only state until that field exists.
      }));
      setHydrated(true);
    }
  }, [data, hydrated]);

  const handleSave = () => {
    update.mutate(
      {
        themeColor: config.themeColor,
        heroTitle: config.heroTitle,
        heroSubtitle: config.heroSubtitle,
        aboutText: config.aboutText,
        contactEmail: config.contactEmail || null,
        contactPhone: config.contactPhone || null,
      },
      {
        onSuccess: () => toast.success('Landing page visual configuration published successfully!'),
        onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to publish changes'),
      }
    );
  };

  const selectedTheme =
    Object.values(THEME_SWATCHES).find((t) => t.hex === config.themeColor) || THEME_SWATCHES.indigo;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-5 space-y-4">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
          <div className="xl:col-span-7">
            <Skeleton className="h-125 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return <ErrorState message="Failed to load the landing page configuration." onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Landing Page Customizer"
        description="Configure the public-facing landing page of your institution and preview edits instantly."
        actions={
          <Button variant="gradient" onClick={handleSave} isLoading={update.isPending} type="button">
            {!update.isPending && <Save className="w-4 h-4" />}
            {update.isPending ? 'Publishing...' : 'Publish Changes'}
          </Button>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Side: Inputs visual configuration */}
        <div className="xl:col-span-5 space-y-6">
          <div className="glass-card p-6 rounded-2xl space-y-4">
            <h3 className="text-md font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Palette className="w-4.5 h-4.5 text-primary-600 dark:text-primary-400" />
              Theme &amp; Brand Styling
            </h3>

            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1.5 block">Theme Color Accent</label>
              <div className="flex gap-2">
                {Object.entries(THEME_SWATCHES).map(([colorName, swatch]) => (
                  <button
                    key={colorName}
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, themeColor: swatch.hex }))}
                    className={`w-8 h-8 rounded-full border-2 transition-all relative ${
                      config.themeColor === swatch.hex
                        ? 'border-slate-800 dark:border-white scale-110 shadow-lg'
                        : 'border-transparent opacity-60 hover:opacity-100 hover:scale-105'
                    }`}
                    style={{ backgroundColor: swatch.hex }}
                    title={`Theme color ${colorName}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl space-y-4">
            <h3 className="text-md font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Type className="w-4.5 h-4.5 text-primary-600 dark:text-primary-400" />
              Hero Section Text
            </h3>

            <div className="space-y-3">
              <Input
                id="website-heroTitle"
                label="Hero Main Title"
                value={config.heroTitle}
                onChange={(e) => setConfig((prev) => ({ ...prev, heroTitle: e.target.value }))}
                placeholder="E.g. Building Tomorrow's Leaders"
              />

              <Textarea
                id="website-heroSubtitle"
                label="Hero Subtitle"
                rows={3}
                value={config.heroSubtitle}
                onChange={(e) => setConfig((prev) => ({ ...prev, heroSubtitle: e.target.value }))}
                placeholder="Enter a brief tag description"
              />
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl space-y-4">
            <h3 className="text-md font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Info className="w-4.5 h-4.5 text-primary-600 dark:text-primary-400" />
              About Institution Section
            </h3>

            <Textarea
              id="website-aboutText"
              label="About Us Body Text"
              rows={4}
              value={config.aboutText}
              onChange={(e) => setConfig((prev) => ({ ...prev, aboutText: e.target.value }))}
              placeholder="Institutional profile information"
            />
          </div>

          <div className="glass-card p-6 rounded-2xl space-y-4">
            <h3 className="text-md font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Phone className="w-4.5 h-4.5 text-primary-600 dark:text-primary-400" />
              Contact Information
            </h3>

            <div className="space-y-3">
              <Input
                id="website-contactEmail"
                type="email"
                label="Official Email Address"
                value={config.contactEmail}
                onChange={(e) => setConfig((prev) => ({ ...prev, contactEmail: e.target.value }))}
              />

              <Input
                id="website-contactPhone"
                type="text"
                label="Contact Hotline"
                value={config.contactPhone}
                onChange={(e) => setConfig((prev) => ({ ...prev, contactPhone: e.target.value }))}
              />

              <Input
                id="website-contactAddress"
                type="text"
                label="Campus Address"
                helperText="Preview only — not yet saved (no backend field for it)."
                value={config.contactAddress}
                onChange={(e) => setConfig((prev) => ({ ...prev, contactAddress: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* Right Side: Preview */}
        <div className="xl:col-span-7 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wide uppercase">
              Preview
            </span>
            <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setPreviewMode('desktop')}
                aria-pressed={previewMode === 'desktop'}
                title="Desktop preview"
                className={`p-1.5 rounded-md transition-colors ${
                  previewMode === 'desktop'
                    ? 'bg-white dark:bg-slate-900 text-primary-600 dark:text-primary-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Monitor className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('mobile')}
                aria-pressed={previewMode === 'mobile'}
                title="Mobile preview"
                className={`p-1.5 rounded-md transition-colors ${
                  previewMode === 'mobile'
                    ? 'bg-white dark:bg-slate-900 text-primary-600 dark:text-primary-400 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Smartphone className="w-4 h-4" />
              </button>
            </div>
          </div>

          <WebsitePreview config={config} theme={selectedTheme} mode={previewMode} />
        </div>
      </div>
    </div>
  );
}
