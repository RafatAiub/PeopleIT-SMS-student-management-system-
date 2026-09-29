import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Bell, Save } from 'lucide-react';
import { Button, Table, TableHead, TableHeaderCell, TableRow, TableCell, Checkbox, Skeleton, ErrorState, Alert } from '@/components/ui';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  NOTIFICATION_TYPE_GROUPS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CHANNEL_LABELS,
  type NotificationChannel,
  type NotificationPreferenceRow,
} from '../settings.queries';

/** `type:channel` -> enabled. Absent entries default to enabled (server rule). */
type PrefMap = Record<string, boolean>;
const key = (type: string, channel: NotificationChannel) => `${type}:${channel}`;

const NotificationsTab: React.FC = () => {
  const { data, isLoading, isError, refetch } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const [prefs, setPrefs] = useState<PrefMap>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!data) return;
    const map: PrefMap = {};
    for (const row of data) map[key(row.type, row.channel)] = row.enabled;
    setPrefs(map);
    setDirty(false);
  }, [data]);

  const isEnabled = (type: string, channel: NotificationChannel) => prefs[key(type, channel)] ?? true;

  const toggle = (type: string, channel: NotificationChannel) => {
    setPrefs((p) => ({ ...p, [key(type, channel)]: !isEnabled(type, channel) }));
    setDirty(true);
  };

  const handleSave = () => {
    const preferences: NotificationPreferenceRow[] = [];
    for (const group of NOTIFICATION_TYPE_GROUPS) {
      for (const { type } of group.types) {
        for (const channel of NOTIFICATION_CHANNELS) {
          preferences.push({ type, channel, enabled: isEnabled(type, channel) });
        }
      }
    }
    update.mutate(preferences, {
      onSuccess: () => {
        toast.success('Notification preferences saved');
        setDirty(false);
      },
      onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to save preferences'),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return <ErrorState message="Failed to load notification preferences." onRetry={refetch} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-500 dark:text-blue-400" />
          Notifications
        </h3>
        <Button variant="gradient" size="sm" type="button" onClick={handleSave} isLoading={update.isPending} disabled={!dirty}>
          <Save className="w-4 h-4" />
          {update.isPending ? 'Saving...' : 'Save preferences'}
        </Button>
      </div>

      <Alert tone="info">
        Choose which channels you receive each kind of notification on. In-app notifications always show in your
        bell menu here; email and SMS depend on this institution having those channels configured.
      </Alert>

      <div className="space-y-6">
        {NOTIFICATION_TYPE_GROUPS.map((group) => (
          <div key={group.label} className="space-y-2">
            <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              {group.label}
            </h4>
            <Table>
              <TableHead>
                <TableHeaderCell className="w-1/2">Notification</TableHeaderCell>
                {NOTIFICATION_CHANNELS.map((channel) => (
                  <TableHeaderCell key={channel} className="text-center">
                    {NOTIFICATION_CHANNEL_LABELS[channel]}
                  </TableHeaderCell>
                ))}
              </TableHead>
              <tbody>
                {group.types.map((t) => (
                  <TableRow key={t.type}>
                    <TableCell className="font-medium text-slate-800 dark:text-slate-200">{t.label}</TableCell>
                    {NOTIFICATION_CHANNELS.map((channel) => (
                      <TableCell key={channel} className="text-center">
                        <Checkbox
                          id={`pref-${t.type}-${channel}`}
                          label={<span className="sr-only">{`${t.label} — ${NOTIFICATION_CHANNEL_LABELS[channel]}`}</span>}
                          className="justify-center"
                          checked={isEnabled(t.type, channel)}
                          onChange={() => toggle(t.type, channel)}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NotificationsTab;
