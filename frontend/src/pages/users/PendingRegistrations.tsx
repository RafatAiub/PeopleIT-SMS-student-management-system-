import React, { useEffect, useState } from 'react';
import { UserPlus, Check, X, MailWarning, Loader2, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import apiClient from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import { formatBdMobile } from '../../utils/identifier';

// =============================================================================
// Approval queue for self-registered users
// =============================================================================
// Sits above the user table rather than on its own route: an admin who never
// goes looking for a queue would never find it, and a pending registration is
// only actionable from the page they already visit to manage people.
//
// The panel renders nothing at all when the queue is empty, so it costs no
// screen space on the common day.

type Role = 'STUDENT' | 'GUARDIAN' | 'TEACHER';

interface PendingRegistration {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  requestedRole: Role;
  emailVerified: boolean;
  createdAt: string;
}

const ROLE_LABELS: Record<Role, string> = {
  STUDENT: 'Student',
  GUARDIAN: 'Parent / Guardian',
  TEACHER: 'Teacher',
};

interface Props {
  /** Called after an approval so the parent's user list picks up the new row. */
  onChanged?: () => void;
}

const PendingRegistrations = ({ onChanged }: Props) => {
  const [rows, setRows] = useState<PendingRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PendingRegistration | null>(null);

  // Role overrides, keyed by registration id. Absent means "accept what they
  // asked for" — we only send a role when the admin actually changed it.
  const [roleOverrides, setRoleOverrides] = useState<Record<string, Role>>({});

  const load = async () => {
    try {
      const res = await apiClient.get('/users/pending-registrations');
      setRows(res.data.data || []);
    } catch (err) {
      console.error('Failed to load pending registrations', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const approve = async (row: PendingRegistration) => {
    setBusyId(row.id);
    try {
      const override = roleOverrides[row.id];
      const { data } = await apiClient.post(`/users/pending-registrations/${row.id}/approve`, {
        ...(override && override !== row.requestedRole ? { role: override } : {}),
      });
      toast.success(data.message || 'Registration approved');
      setRows((current) => current.filter((r) => r.id !== row.id));
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not approve this registration.');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async () => {
    if (!rejecting) return;
    const row = rejecting;
    setBusyId(row.id);
    try {
      const { data } = await apiClient.post(`/users/pending-registrations/${row.id}/reject`);
      toast.success(data.message || 'Registration rejected');
      setRows((current) => current.filter((r) => r.id !== row.id));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Could not reject this registration.');
    } finally {
      setBusyId(null);
      setRejecting(null);
    }
  };

  // Nothing to show while loading, and nothing to show when the queue is clear.
  if (loading || rows.length === 0) return null;

  return (
    <>
      <section className="glass-card rounded-2xl border border-amber-200 dark:border-amber-500/20 overflow-hidden">
        <header className="flex items-center gap-3 px-5 py-4 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/20">
          <span className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center shrink-0">
            <UserPlus className="w-4.5 h-4.5 text-amber-700 dark:text-amber-400" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {rows.length} registration{rows.length === 1 ? '' : 's'} waiting for approval
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              These people signed up with your institution code. Approve only those you recognise.
            </p>
          </div>
        </header>

        <ul className="divide-y divide-slate-200 dark:divide-white/5">
          {rows.map((row) => {
            const selectedRole = roleOverrides[row.id] ?? row.requestedRole;
            const busy = busyId === row.id;

            return (
              <li key={row.id} className="p-4 sm:px-5 flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">
                      {row.firstName} {row.lastName}
                    </p>
                    {row.emailVerified ? (
                      <Badge variant="success">Email confirmed</Badge>
                    ) : (
                      <Badge variant="warning">Email not confirmed</Badge>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 break-all">
                    {row.email}
                    {row.phone && (
                      <span className="text-slate-400 dark:text-slate-500">
                        {' · '}
                        {formatBdMobile(row.phone)}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Requested {ROLE_LABELS[row.requestedRole]} ·{' '}
                    {new Date(row.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  {/* The role they asked for is a request, not a grant — the
                      approver confirms or corrects it here. */}
                  <div className="relative">
                    <select
                      aria-label={`Role for ${row.firstName} ${row.lastName}`}
                      value={selectedRole}
                      disabled={busy}
                      onChange={(e) =>
                        setRoleOverrides((o) => ({ ...o, [row.id]: e.target.value as Role }))
                      }
                      className="input-field py-2 pl-3 pr-8 text-sm appearance-none cursor-pointer"
                    >
                      {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                        <option
                          key={r}
                          value={r}
                          className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        >
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>

                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setRejecting(row)}
                    className="py-2 px-3 text-sm"
                  >
                    <X className="w-4 h-4" />
                    <span className="sr-only sm:not-sr-only sm:ml-1">Reject</span>
                  </Button>

                  {/* An unconfirmed address cannot be approved — the backend
                      refuses it, so the button says why rather than failing. */}
                  <Button
                    variant="gradient"
                    disabled={busy || !row.emailVerified}
                    title={
                      row.emailVerified
                        ? undefined
                        : 'They must confirm their email address before you can approve them'
                    }
                    onClick={() => approve(row)}
                    className="py-2 px-3 text-sm"
                  >
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : row.emailVerified ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <MailWarning className="w-4 h-4" />
                    )}
                    <span className="sr-only sm:not-sr-only sm:ml-1">Approve</span>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <ConfirmModal
        isOpen={rejecting !== null}
        onCancel={() => setRejecting(null)}
        onConfirm={reject}
        isLoading={busyId !== null && rejecting?.id === busyId}
        title="Reject this registration?"
        message={
          rejecting
            ? `${rejecting.firstName} ${rejecting.lastName} (${rejecting.email}) will not be able to sign in, and cannot register again with the same details.`
            : ''
        }
        confirmLabel="Reject"
        variant="danger"
      />
    </>
  );
};

export default PendingRegistrations;
