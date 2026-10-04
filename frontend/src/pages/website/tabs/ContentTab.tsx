import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList, Download, Images, Users2 } from 'lucide-react';
import { Tabs } from '@/components/ui';
import { useT } from '@/i18n';
import { CommitteeView } from '../content/CommitteeView';
import { AlbumsView } from '../content/AlbumsView';
import { DownloadsView } from '../content/DownloadsView';
import { AdmissionsView } from '../content/AdmissionsView';

const VIEWS = ['committee', 'albums', 'downloads', 'admissions'] as const;
export type ContentView = (typeof VIEWS)[number];

/**
 * Website > Content — managing committee, photo albums, downloads and
 * admission circulars, grouped in one tab (§3 C4) so the tab bar stays
 * short. Deep-linkable via `?contentView=…` (the compliance checklist's
 * "Fix" link for the committee item uses this).
 */
export const ContentTab: React.FC = () => {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const requested = params.get('contentView') as ContentView | null;
  const view: ContentView = requested && VIEWS.includes(requested) ? requested : 'committee';
  const setView = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('contentView', id);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <Tabs
        variant="pills"
        idPrefix="content-view"
        label={t('Content sections')}
        value={view}
        onChange={setView}
        tabs={[
          { id: 'committee', label: t('Committee'), icon: <Users2 /> },
          { id: 'albums', label: t('Albums'), icon: <Images /> },
          { id: 'downloads', label: t('Downloads'), icon: <Download /> },
          { id: 'admissions', label: t('Admissions'), icon: <ClipboardList /> },
        ]}
      />
      {view === 'committee' && <CommitteeView />}
      {view === 'albums' && <AlbumsView />}
      {view === 'downloads' && <DownloadsView />}
      {view === 'admissions' && <AdmissionsView />}
    </div>
  );
};
