import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bus, MapPinned, Users2 } from 'lucide-react';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { DashboardSkeleton } from '../../components/common/DashboardSkeleton';
import { EmptyState } from '../../components/common/EmptyState';
import { PageHeader, StatCard, ErrorState, Button } from '../../components/ui';

export const TransportOfficerDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const vehiclesQuery = useQuery({
    queryKey: ['transport', 'vehicles'],
    queryFn: async () => (await apiClient.get('/transport/vehicles')).data.data ?? [],
  });
  const routesQuery = useQuery({
    queryKey: ['transport', 'routes'],
    queryFn: async () => (await apiClient.get('/transport/routes')).data.data ?? [],
  });
  const assignmentsQuery = useQuery({
    queryKey: ['transport', 'assignments'],
    queryFn: async () => (await apiClient.get('/transport/assignments')).data.data ?? [],
  });

  if (vehiclesQuery.isLoading || routesQuery.isLoading || assignmentsQuery.isLoading) return <DashboardSkeleton />;
  if (vehiclesQuery.isError || routesQuery.isError || assignmentsQuery.isError) {
    return (
      <ErrorState
        onRetry={() => { vehiclesQuery.refetch(); routesQuery.refetch(); assignmentsQuery.refetch(); }}
        message="Could not load transport data."
      />
    );
  }

  const vehicles = vehiclesQuery.data ?? [];
  const routes = routesQuery.data ?? [];
  const assignments = assignmentsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${user?.firstName ?? ''}`} description="Vehicles, routes, and student transport assignments." />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Vehicles" value={vehicles.length} icon={<Bus />} tone="primary" hint="Registered vehicles" />
        <StatCard label="Routes" value={routes.length} icon={<MapPinned />} tone="info" hint="Active routes" />
        <StatCard label="Student Assignments" value={assignments.length} icon={<Users2 />} tone="success" hint="Students assigned" />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button leftIcon={<Bus className="w-4 h-4" />} onClick={() => navigate('/transport')}>Manage Transport</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">Vehicles</h3>
          {vehicles.length === 0 ? (
            <EmptyState title="No vehicles yet" description="Registered vehicles will appear here." icon={<Bus className="w-10 h-10 text-slate-400 dark:text-slate-500" />} />
          ) : (
            <div className="space-y-3">
              {vehicles.slice(0, 6).map((v: any) => (
                <div key={v.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-white/5">
                  <p className="font-semibold text-sm text-slate-900 dark:text-white">{v.registrationNumber}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Driver: {v.driverName}{v.driverPhone ? ` · ${v.driverPhone}` : ''}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">Routes</h3>
          {routes.length === 0 ? (
            <EmptyState title="No routes yet" description="Transport routes will appear here." icon={<MapPinned className="w-10 h-10 text-slate-400 dark:text-slate-500" />} />
          ) : (
            <div className="space-y-3">
              {routes.slice(0, 6).map((r: any) => (
                <div key={r.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-white/5">
                  <p className="font-semibold text-sm text-slate-900 dark:text-white">{r.name}</p>
                  {r.stops && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{r.stops}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransportOfficerDashboard;
