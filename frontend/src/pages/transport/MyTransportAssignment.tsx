import React, { useEffect, useState } from 'react';
import { Bus, MapPin, User, Phone, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { EmptyState } from '../../components/common/EmptyState';

interface TransportAssignment {
  id: string;
  studentId: string;
  pickupPoint: string;
  assignedAt: string;
  route: {
    id: string;
    name: string;
    stops: number;
    routeFare: number;
  };
  vehicle: {
    id: string;
    registrationNumber: string;
    capacity: number;
    driverName: string;
    driverPhone: string;
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

  // Load linked children for GUARDIAN role
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
    return <div className="text-slate-500 dark:text-slate-400 p-8 text-center">Loading your dashboard...</div>;
  }

  if (isGuardian && children.length === 0) {
    return (
      <div className="glass-card p-8">
        <EmptyState
          title="No linked children found"
          description="Contact your school administrator to link your account to your child's student profile."
          icon={<Users className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">My Transport Assignment</h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1">View your assigned transport route and vehicle details.</p>
      </div>

      {isGuardian && children.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {children.map((child) => (
            <button
              key={child.id}
              onClick={() => setSelectedChildId(child.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                selectedChildId === child.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {child.firstName} {child.lastName}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-slate-500 dark:text-slate-400 p-8 text-center">Loading your transport assignment...</div>
      ) : error ? (
        <div className="glass-card p-8">
          <EmptyState
            title="Failed to load transport assignment"
            description="Something went wrong while fetching your transport details."
            icon={<Bus className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
            action={
              <button
                onClick={fetchAssignment}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all"
              >
                Retry
              </button>
            }
          />
        </div>
      ) : !assignment ? (
        <div className="glass-card p-8">
          <EmptyState
            title="No transport assignment yet"
            description="You haven't been assigned to a transport route. Contact your school administrator for details."
            icon={<Bus className="w-10 h-10 text-slate-400 dark:text-slate-500" />}
          />
        </div>
      ) : (
        <div className="glass-card rounded-2xl border border-slate-200/50 dark:border-white/10 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-transparent">
              <Bus className="w-4 h-4" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">{assignment.route?.name}</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Route details */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-transparent">
                  <Bus className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Route</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {assignment.route?.name} &middot; {assignment.route?.stops} stops
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-transparent">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Pickup Point</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{assignment.pickupPoint}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-transparent">
                  <Bus className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Route Fare</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    ৳{Number(assignment.route?.routeFare || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Vehicle / driver details */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-transparent">
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
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-transparent">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Driver</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{assignment.vehicle?.driverName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-transparent">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Driver Phone</p>
                  <a
                    href={`tel:${assignment.vehicle?.driverPhone}`}
                    className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {assignment.vehicle?.driverPhone}
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200 dark:border-white/10">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Assigned on {assignment.assignedAt ? new Date(assignment.assignedAt).toLocaleDateString() : '-'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyTransportAssignment;
