import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Palette, Save } from 'lucide-react';
import { Button, Select, Alert, Skeleton, ErrorState } from '@/components/ui';
import { useUiStore, type ThemeMode } from '@/store/uiStore';
import { useInstitutionWebsite, useUpdateInstitutionWebsite } from '../settings.queries';
import { LogoUploader } from './LogoUploader';

// Named swatches map to the hex values persisted by the backend
// (Institution.themeColor is a strict #RRGGBB/#RGB string). Kept in sync
// with the palette in pages/website/WebsiteBuilder.tsx by convention, not by
// import — the two pages are separately owned.
const THEME_SWATCHES: Record<string, string> = {
  indigo: '#4f46e5',
  emerald: '#059669',
  blue: '#2563eb',
  rose: '#e11d48',
  amber: '#d97706',
};

interface FormState {
  logoUrl: string;
  themeColor: string;
}

const BrandingTab: React.FC = () => {
  const { data, isLoading, isError, refetch } = useInstitutionWebsite();
  const update = useUpdateInstitutionWebsite();
  const { theme, setTheme } = useUiStore();
  const [form, setForm] = useState<FormState>({ logoUrl: '', themeColor: THEME_SWATCHES.indigo });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (data && !hydrated) {
      setForm({ logoUrl: data.logoUrl || '', themeColor: data.themeColor || THEME_SWATCHES.indigo });
      setHydrated(true);
    }
  }, [data, hydrated]);

  const handleSave = () => {
    update.mutate(form, {
      onSuccess: () => toast.success('Branding updated & synced across the portal!'),
      onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update branding'),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return <ErrorState message="Failed to load branding settings." onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
        <Palette className="w-5 h-5 text-blue-500 dark:text-blue-400" />
        Branding
      </h3>

      <div className="space-y-5">
        <LogoUploader value={form.logoUrl} onChange={(logoUrl) => setForm((p) => ({ ...p, logoUrl }))} />

        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-400 mb-1.5 block">
            Brand colour accent
          </label>
          <div className="flex gap-2">
            {Object.entries(THEME_SWATCHES).map(([colorName, hex]) => (
              <button
                key={colorName}
                type="button"
                onClick={() => setForm((p) => ({ ...p, themeColor: hex }))}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  form.themeColor === hex
                    ? 'border-slate-800 dark:border-white scale-110 shadow-lg'
                    : 'border-transparent opacity-60 hover:opacity-100 hover:scale-105'
                }`}
                style={{ backgroundColor: hex }}
                title={`Theme colour ${colorName}`}
                aria-label={`Theme colour ${colorName}`}
              />
            ))}
          </div>
          <Alert tone="info" className="mt-3">
            This colour currently only affects your institution's public website (Website Builder). It does not
            change the colours of this staff/student portal.
          </Alert>
        </div>

        <Select
          id="settings-theme"
          label="Portal theme mode"
          helperText="Your own display preference for this portal — dark, light, or match your device."
          value={theme}
          onChange={(e) => setTheme(e.target.value as ThemeMode)}
          options={[
            { value: 'light', label: 'Light theme' },
            { value: 'dark', label: 'Dark theme' },
            { value: 'system', label: 'System default' },
          ]}
        />
      </div>

      <div className="pt-2 flex justify-end">
        <Button variant="gradient" onClick={handleSave} isLoading={update.isPending} type="button">
          <Save className="w-4 h-4" />
          {update.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
};

export default BrandingTab;
