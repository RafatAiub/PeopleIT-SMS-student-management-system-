import React, { useEffect, useState } from 'react';
import { Bus, MapPin, User, Phone, Users, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { EmptyState } from '../../components/common/EmptyState';
import { PageHeader, ErrorState, SkeletonText } from '../../components/ui';
import { formatCurrency, formatDate } from '../../i18n';
import { StopsChips } from './StopsChips';

interface TransportAssignment {
  id: string;
  studentId: string;
  pickupPoint: string | null;
  // Wave C — structured stop, when staff picked one.
  stop?: { name: string; sequence: number; pickupTime: string | null; dropTime: string | null } | null;
  assignedAt: string;
  route: {
    id: string;
    name: string;
    stops: string;
    routeFare: number | string;
  };
  vehicle: {
    id: string;
    registrationNumber: string;
    capacity: number;
    driverName: string;
    driverPhone: string | null;
  };
}

interface ChildSummary {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  isPrimary: boolean;
  class: { name: string } | null;
  section: { name: string } | null;
}

const MyTransportAssignment: React.FC = () => {
  const { user } = useAuthStore();
  const isGuardian = user?.role === 'GUARDIAN';

  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [childrenLoading, setChildrenLoading] = useState(isGuardian);

  const [assignment, setAssignment] = useState<TransportAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isGuardian) return;
    const fetchChildren = async () => {
      try {
        const res = await apiClient.get('/guardians/me/students');
        const list: ChildSummary[] = res.data.data || [];
        setChildren(list);
        if (list.length > 0) setSelectedChildId(list[0].id);
      } catch (err) {
        console.error('Failed to load linked children', err);
        toast.error('Failed to load your children');
      } finally {
        setChildrenLoading(false);
      }
    };
    fetchChildren();
  }, [isGuardian]);

  const fetchAssignment = async () => {
    if (isGuardian && !selectedChildId) return;
    setLoading(true);
    setError(false);
    try {
      const params: Record<string, any> = {};
      if (isGuardian && selectedChildId) params.studentId = selectedChildId;
      const res = await apiClient.get('/transport/me/assignment', { params });
      setAssignment(res.data.data ?? null);
    } catch (err: any) {
      console.error('Failed to load transport assignment', err);
      setError(true);
      toast.error(err.response?.data?.message || 'Failed to load your transport assignment');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isGuardian && childrenLoading) return;
    if (isGuardian && children.length === 0) {
      setLoading(false);
      return;
    }
    fetchAssignment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildId, childrenLoading]);

  if (isGuardian && childrenLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Transport Assignment" description="View your assigned transport route and vehicle details." />
        <SkeletonText lines={4} />
      </div>
    );
  }

  if (isGuardian && children.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="My Transport Assignment" description="View your assigned transport route and vehicle details." />
        <div className="glass-card p-8">
          <EmptyState
            title="No linked children found"
            description="Contact your school administrator to link your account to your child's student profile."
            icon={<Users className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="My Transport Assignment" description="View your assigned transport route and vehicle details." />

      {isGuardian && children.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => setSelectedChildId(child.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                selectedChildId === child.id
                  ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {child.firstName} {child.lastName}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <SkeletonText lines={5} />
      ) : error ? (
        <ErrorState message="Something went wrong while fetching your transport details." onRetry={fetchAssignment} />
      ) : !assignment ? (
        <div className="glass-card p-8">
          <EmptyState
            title="No transport assignment yet"
            description="You haven't been assigned to a transport route. Contact your school administrator for details."
            icon={<Bus className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
          />
        </div>
      ) : (
        <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/10 p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-500/20 flex items-center justify-center text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-transparent shrink-0">
              <Bus className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{assignment.route?.name}</h3>
              {assignment.pickupPoint && (
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" /> Pickup at {assignment.pickupPoint}
                </p>
              )}
              {assignment.stop && (
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" /> Stop {assignment.stop.sequence}: {assignment.stop.name}
                  {assignment.stop.pickupTime ? ` · pickup ${assignment.stop.pickupTime}` : ''}
                  {assignment.stop.dropTime ? ` · drop ${assignment.stop.dropTime}` : ''}
                </p>
              )}
            </div>
          </div>

          {/* Stops timeline */}
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Route Stops</p>
            <StopsChips stops={assignment.route?.stops} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-white/10">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-500/20 flex items-center justify-center text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-transparent shrink-0">
                  <Bus className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Vehicle</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {assignment.vehicle?.registrationNumber} &middot; {assignment.vehicle?.capacity} seats
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-500/20 flex items-center justify-center text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-transparent shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Driver</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{assignment.vehicle?.driverName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-500/20 flex items-center justify-center text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-transparent shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Driver Phone</p>
                  {assignment.vehicle?.driverPhone ? (
                    <a
                      href={`tel:${assignment.vehicle.driverPhone}`}
                      className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {assignment.vehicle.driverPhone}
                    </a>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">—</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-500/20 flex items-center justify-center text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-transparent shrink-0">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Monthly Fare</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{formatCurrency(assignment.route?.routeFare)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-white/10">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Assigned on {assignment.assignedAt ? formatDate(assignment.assignedAt) : '-'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyTransportAssignment;
