import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Building, Save } from 'lucide-react';
import { Button, Input, Textarea, Skeleton, ErrorState } from '@/components/ui';
import { useInstitutionWebsite, useUpdateInstitutionWebsite } from '../settings.queries';
import { LogoUploader } from './LogoUploader';

interface FormState {
  name: string;
  email: string;
  phone: string;
  address: string;
  logoUrl: string;
}

const EMPTY: FormState = { name: '', email: '', phone: '', address: '', logoUrl: '' };

const InstitutionProfileTab: React.FC = () => {
  const { data, isLoading, isError, refetch } = useInstitutionWebsite();
  const update = useUpdateInstitutionWebsite();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (data && !hydrated) {
      setForm({
        name: data.name || '',
        email: data.email || data.contactEmail || '',
        phone: data.phone || data.contactPhone || '',
        address: data.address || '',
        logoUrl: data.logoUrl || '',
      });
      setHydrated(true);
    }
  }, [data, hydrated]);

  const handleSave = () => {
    update.mutate(form, {
      onSuccess: () => toast.success('Institution profile updated & synced across the portal!'),
      onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update settings'),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return <ErrorState message="Failed to load institution settings." onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
        <Building className="w-5 h-5 text-blue-500 dark:text-blue-400" />
        Institution Profile
      </h3>

      <div className="space-y-5">
        <LogoUploader value={form.logoUrl} onChange={(logoUrl) => setForm((p) => ({ ...p, logoUrl }))} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            id="settings-name"
            label="Institution Name"
            placeholder="e.g. MUAZ ISLAMIC SCHOOL"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
          <Input
            id="settings-email"
            type="email"
            label="Email Address"
            placeholder="admin@school.com"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          />
        </div>

        <Input
          id="settings-phone"
          label="Phone Number"
          placeholder="+880 1234 56789"
          value={form.phone}
          onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
        />

        <Textarea
          id="settings-address"
          label="Address"
          placeholder="Campus Street, City, Country"
          value={form.address}
          onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
          rows={3}
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

export default InstitutionProfileTab;
