import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Map, Bus, Users, Gauge } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Card, CardHeader, StatCard, SkeletonStatGrid, Skeleton, ErrorState, Badge } from '../../components/ui';
import { EmptyState } from '../../components/common/EmptyState';
import { DataTable, type Column } from '../../components/DataTable/DataTable';
import { chartColors, chartAxis, chartGrid, chartTooltipStyle } from '../../lib/chartTheme';
import { useT, formatCurrency, formatNumber } from '../../i18n';
import apiClient from '../../api/client';

interface RouteRow {
  routeId: string;
  name: string;
  isActive: boolean;
  routeFare: number;
  students: number;
  monthlyFareTotal: number;
  capacity: number;
  utilisation: number | null;
  vehicles: { vehicleId: string; registrationNumber: string; capacity: number; studentsOnRoute: number }[];
  stops: { stopId: string | null; name: string; sequence: number | null; students: number }[];
}
interface VehicleRow {
  vehicleId: string;
  registrationNumber: string;
  isActive: boolean;
  capacity: number;
  assigned: number;
  utilisation: number | null;
  overCapacity: boolean;
}
interface RouteReportData {
  totals: { routes: number; vehicles: number; students: number; capacity: number; utilisation: number | null };
  routes: RouteRow[];
  vehicles: VehicleRow[];
}

const pct = (v: number | null) => (v === null ? '—' : `${formatNumber(v)}%`);

/** Students per route/stop and seat utilisation. GET /transport/reports/routes (SA/A/TO). */
export const RouteReport: React.FC = () => {
  const t = useT();
  const q = useQuery({
    queryKey: ['transport-extras', 'route-report'],
    queryFn: async (): Promise<RouteReportData> => (await apiClient.get('/transport/reports/routes')).data.data,
  });
  const colors = chartColors();

  if (q.isLoading) return <div className="space-y-4"><SkeletonStatGrid count={4} /><Skeleton className="h-72" /></div>;
  if (q.isError || !q.data) return <ErrorState message={t('Could not load the route report.')} onRetry={() => q.refetch()} />;
  const r = q.data;

  const vehicleCols: Column<VehicleRow & { id: string }>[] = [
    { key: 'reg', header: t('Vehicle'), primary: true, render: (v) => v.registrationNumber, exportValue: (v) => v.registrationNumber },
    { key: 'assigned', header: t('Students'), align: 'right', exportValue: (v) => v.assigned, render: (v) => formatNumber(v.assigned) },
    { key: 'capacity', header: t('Seats'), align: 'right', exportValue: (v) => v.capacity, render: (v) => formatNumber(v.capacity) },
    {
      key: 'util',
      header: t('Utilisation'),
      align: 'right',
      exportValue: (v) => v.utilisation ?? '',
      render: (v) => (v.overCapacity ? <Badge variant="danger">{pct(v.utilisation)} · {t('over capacity')}</Badge> : pct(v.utilisation)),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label={t('Routes')} value={formatNumber(r.totals.routes)} icon={<Map />} />
        <StatCard label={t('Vehicles')} value={formatNumber(r.totals.vehicles)} icon={<Bus />} tone="info" />
        <StatCard label={t('Students assigned')} value={formatNumber(r.totals.students)} icon={<Users />} tone="success" />
        <StatCard label={t('Seat utilisation')} value={pct(r.totals.utilisation)} icon={<Gauge />} tone="accent" hint={t('{n} seats on active vehicles', { n: formatNumber(r.totals.capacity) })} />
      </div>

      <Card>
        <CardHeader title={t('Students vs seats per route')} description={t('Seats = capacity of the vehicles serving each route (a shared vehicle counts on each route).')} />
        {r.routes.length === 0 ? (
          <EmptyState compact title={t('No routes yet')} description={t('Add routes and assign students to see utilisation.')} />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r.routes}>
                <CartesianGrid {...chartGrid} />
                <XAxis dataKey="name" {...chartAxis} interval={0} tickFormatter={(v: string) => (v.length > 12 ? `${v.slice(0, 11)}…` : v)} />
                <YAxis {...chartAxis} allowDecimals={false} width={40} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend />
                <Bar dataKey="students" name={t('Students')} fill={colors[0]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="capacity" name={t('Seats')} fill={colors[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {r.routes.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {r.routes.map((route) => (
            <Card key={route.routeId}>
              <CardHeader
                title={route.name}
                description={t('{s} students · {u} utilisation · {f}/month', { s: formatNumber(route.students), u: pct(route.utilisation), f: formatCurrency(route.monthlyFareTotal) })}
                actions={!route.isActive ? <Badge variant="neutral">{t('Inactive')}</Badge> : undefined}
              />
              {route.stops.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('No structured stops and no students on this route.')}</p>
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-white/10 text-sm">
                  {route.stops.map((s) => (
                    <li key={s.stopId ?? 'none'} className="flex items-center justify-between py-1.5 gap-2">
                      <span className={`truncate ${s.stopId ? 'text-slate-900 dark:text-white' : 'italic text-slate-500 dark:text-slate-400'}`}>
                        {s.sequence ? `${s.sequence}. ` : ''}{s.stopId ? s.name : t('No stop selected')}
                      </span>
                      <span className="tabular-nums text-slate-600 dark:text-slate-300 shrink-0">{formatNumber(s.students)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t('Vehicle utilisation')}</h3>
        <DataTable
          data={r.vehicles.map((v) => ({ ...v, id: v.vehicleId }))}
          columns={vehicleCols}
          exportFileName="transport-vehicle-utilisation"
          emptyTitle={t('No vehicles yet')}
          emptyDescription={t('Add vehicles to see seat utilisation.')}
        />
      </div>
    </div>
  );
};
