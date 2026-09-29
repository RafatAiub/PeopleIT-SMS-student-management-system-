import React, { useState, useEffect } from 'react';
import { Building2, User, ShieldAlert, Search, ArrowRight, Sparkles, Check } from 'lucide-react';
import apiClient from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';
import { useNavigate, useLocation } from 'react-router-dom';
import { PageHeader } from '@/components/ui/Display';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Feedback';
import { Input, Select, Textarea, Checkbox } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

interface InstitutionOption {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

const STEPS = [
  { id: 1, label: 'Institution' },
  { id: 2, label: 'User' },
  { id: 3, label: 'Session options' },
];

const StepIndicator: React.FC<{ current: number }> = ({ current }) => (
  <div className="flex items-center gap-2">
    {STEPS.map((s, i) => (
      <React.Fragment key={s.id}>
        <div className={cn('flex items-center gap-2', current >= s.id ? 'text-primary-700 dark:text-primary-300 font-semibold' : 'text-slate-400')}>
          <span
            className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0',
              current > s.id
                ? 'bg-primary-600 text-white'
                : current === s.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            )}
          >
            {current > s.id ? <Check className="w-3.5 h-3.5" /> : s.id}
          </span>
          <span className="text-xs hidden sm:inline">{s.label}</span>
        </div>
        {i < STEPS.length - 1 && <div className={cn('h-0.5 w-8 sm:w-16', current > s.id ? 'bg-primary-600' : 'bg-slate-200 dark:bg-slate-800')} />}
      </React.Fragment>
    ))}
  </div>
);

export const SupportAccessPortal: React.FC = () => {
  const { startSupportSession } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const passedInstId = (location.state as any)?.institutionId || '';

  const [institutions, setInstitutions] = useState<InstitutionOption[]>([]);
  const [instSearch, setInstSearch] = useState('');
  const [selectedInstId, setSelectedInstId] = useState<string>(passedInstId);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [ticketId, setTicketId] = useState<string>('');
  const [isReadOnly, setIsReadOnly] = useState<boolean>(false);

  const [loadingInsts, setLoadingInsts] = useState<boolean>(true);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [launching, setLaunching] = useState<boolean>(false);
  const [userSearch, setUserSearch] = useState<string>('');
  const [reasonError, setReasonError] = useState<string>();

  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        setLoadingInsts(true);
        const res = await apiClient.get('/institution');
        setInstitutions(res.data.data || []);
      } catch {
        toast.error('Failed to load institutions');
      } finally {
        setLoadingInsts(false);
      }
    };
    fetchInstitutions();
  }, []);

  useEffect(() => {
    if (!selectedInstId) {
      setUsers([]);
      setSelectedUserId('');
      return;
    }

    const fetchUsers = async () => {
      try {
        setLoadingUsers(true);
        const res = await apiClient.get('/users', {
          params: { institutionId: selectedInstId, pageSize: 100 },
        });
        const fetchedUsers: UserOption[] = res.data.data || [];
        setUsers(fetchedUsers);

        // Smart default: the institution's primary admin, else the first user.
        const instAdmin = fetchedUsers.find((u) => u.role === 'ADMIN');
        setSelectedUserId(instAdmin ? instAdmin.id : fetchedUsers[0]?.id ?? '');
      } catch {
        toast.error('Failed to load institution users');
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, [selectedInstId]);

  const handleLaunchSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstId || !selectedUserId) {
      toast.error('Select an institution and a target user first');
      return;
    }
    if (reason.trim().length < 5) {
      setReasonError('Reason must be at least 5 characters');
      return;
    }

    setLaunching(true);
    try {
      const res = await apiClient.post('/institution/super-admin/support-session/start', {
        institutionId: selectedInstId,
        targetUserId: selectedUserId,
        reason: reason.trim(),
        ticketId: ticketId.trim() || null,
        isReadOnly,
      });

      const sessionData = res.data.data;
      startSupportSession({
        accessToken: sessionData.accessToken,
        isReadOnly: sessionData.isReadOnly,
        expiresInSeconds: sessionData.expiresInSeconds,
        targetUser: sessionData.targetUser,
        institution: sessionData.institution,
      });

      toast.success(`Support access granted! Operating in ${isReadOnly ? 'read-only' : 'full access'} mode.`);
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to start support session');
    } finally {
      setLaunching(false);
    }
  };

  const filteredInstitutions = institutions.filter((inst) => {
    const q = instSearch.trim().toLowerCase();
    if (!q) return true;
    return inst.name.toLowerCase().includes(q) || inst.slug.toLowerCase().includes(q);
  });

  const filteredUsers = users.filter((u) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      u.email.toLowerCase().includes(q) ||
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const selectedInstitution = institutions.find((i) => i.id === selectedInstId);
  const currentStep = !selectedInstId ? 1 : !selectedUserId ? 2 : 3;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <PageHeader
        title="Customer support access portal"
        description="Safely inspect and troubleshoot client accounts with full audit trailing."
      />

      <Alert tone="warning" title="Every support session is audited">
        Starting a session records the target institution, the user impersonated, your reason, and the ticket ID (if any) to the
        system audit log. Use read-only mode unless a fix genuinely requires making changes on the client's behalf.
      </Alert>

      <Card>
        <StepIndicator current={currentStep} />
      </Card>

      <form onSubmit={handleLaunchSupport} className="space-y-6">
        {/* Step 1: Institution selection */}
        <Card className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-500" /> 1. Select target institution
          </h4>
          <Input
            type="search"
            value={instSearch}
            onChange={(e) => setInstSearch(e.target.value)}
            placeholder="Search institutions by name or code…"
            aria-label="Search institutions"
            leftIcon={<Search className="w-4 h-4" />}
          />
          <Select
            value={selectedInstId}
            onChange={(e) => setSelectedInstId(e.target.value)}
            disabled={loadingInsts}
            aria-label="Select target institution"
            placeholder="— Choose institution —"
            options={filteredInstitutions.map((inst) => ({
              value: inst.id,
              label: `${inst.name} (${inst.slug})${!inst.isActive ? ' [SUSPENDED]' : ''}`,
              disabled: !inst.isActive,
            }))}
          />
        </Card>

        {/* Step 2: Target user selection */}
        {selectedInstId && (
          <Card className="space-y-3 animate-fadeIn">
            <div className="p-3 bg-primary-50 dark:bg-primary-500/10 border border-primary-200 dark:border-primary-500/20 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-semibold text-primary-900 dark:text-primary-200">
                <Sparkles className="w-4 h-4 text-primary-500" />
                <span>{selectedInstitution?.name || 'Selected institution'}</span>
              </div>
              <span className="text-[10px] font-mono uppercase bg-primary-100 text-primary-800 dark:bg-primary-500/20 dark:text-primary-300 px-2.5 py-0.5 rounded-full font-bold">
                {users.length} users loaded
              </span>
            </div>

            <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <User className="w-4 h-4 text-primary-500" /> 2. Select target user
            </h4>

            <Input
              type="search"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Filter users by name, email, or role…"
              aria-label="Search users"
              leftIcon={<Search className="w-4 h-4" />}
            />

            {loadingUsers ? (
              <div className="p-4 text-center text-xs text-slate-500 italic">Loading users…</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 italic">No users found matching query.</div>
            ) : (
              <div className="max-h-56 overflow-y-auto border border-slate-200 dark:border-white/10 rounded-xl divide-y divide-slate-100 dark:divide-white/5">
                {filteredUsers.map((u) => (
                  <label
                    key={u.id}
                    className={cn(
                      'flex items-center justify-between p-3 cursor-pointer transition-colors text-xs',
                      selectedUserId === u.id
                        ? 'bg-primary-50 dark:bg-primary-500/10 border-l-4 border-primary-600'
                        : 'hover:bg-slate-50 dark:hover:bg-white/5'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="targetUser"
                        value={u.id}
                        checked={selectedUserId === u.id}
                        onChange={() => setSelectedUserId(u.id)}
                        className="w-4 h-4 accent-primary-600"
                      />
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{u.firstName} {u.lastName}</p>
                        <p className="text-slate-500">{u.email}</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {u.role}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Step 3: Session options */}
        {selectedUserId && (
          <Card className="space-y-4 animate-fadeIn">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" /> 3. Session options
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Ticket ID / reference (optional)"
                value={ticketId}
                onChange={(e) => setTicketId(e.target.value)}
                placeholder="e.g. TICKET-9402"
                className="font-mono"
              />
              <div>
                <span className="field-label">Access mode</span>
                <div className="p-3 bg-amber-50/50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl">
                  <Checkbox
                    checked={isReadOnly}
                    onChange={(e) => setIsReadOnly(e.target.checked)}
                    label="Enforce read-only mode (recommended)"
                    description="Blocks data modifications to protect client data"
                  />
                </div>
              </div>
            </div>

            <Textarea
              label="Support access reason"
              required
              value={reason}
              onChange={(e) => { setReason(e.target.value); setReasonError(undefined); }}
              error={reasonError}
              rows={2}
              placeholder="Describe why support access is requested (e.g., customer reported fee billing discrepancy on invoice #104)…"
              helperText={reasonError ? undefined : 'Required for the audit log.'}
            />

            <div className="flex justify-end pt-2">
              <Button type="submit" variant="gradient" isLoading={launching} rightIcon={<ArrowRight className="w-4 h-4" />}>
                Start support access session
              </Button>
            </div>
          </Card>
        )}
      </form>
    </div>
  );
};

export default SupportAccessPortal;
