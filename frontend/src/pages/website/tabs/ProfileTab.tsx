import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { BadgeCheck, Users } from 'lucide-react';
import { Tabs } from '@/components/ui';
import { useT } from '@/i18n';
import { InstitutionProfileForm } from '../profile/InstitutionProfileForm';
import { StaffVisibilityView } from '../profile/StaffVisibilityView';

const VIEWS = ['info', 'staff'] as const;
export type ProfileView = (typeof VIEWS)[number];

/**
 * Website > Profile — institution facts (Bangla name, EIIN, MPO, recognition,
 * head of institution, officers) and staff visibility, grouped in one tab so
 * the tab bar stays short. Deep-linkable via `?profileView=info|staff`
 * (the Overview compliance checklist's "Fix" links use this).
 */
export const ProfileTab: React.FC = () => {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const requested = params.get('profileView') as ProfileView | null;
  const view: ProfileView = requested && VIEWS.includes(requested) ? requested : 'info';
  const setView = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('profileView', id);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <Tabs
        variant="pills"
        idPrefix="profile-view"
        label={t('Profile sections')}
        value={view}
        onChange={setView}
        tabs={[
          { id: 'info', label: t('Institution profile'), icon: <BadgeCheck /> },
          { id: 'staff', label: t('Staff visibility'), icon: <Users /> },
        ]}
      />
      {view === 'info' ? <InstitutionProfileForm /> : <StaffVisibilityView />}
    </div>
  );
};
