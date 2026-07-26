import React, { useState, useEffect } from 'react';
import { LifeBuoy, Building2, User, Eye, ShieldAlert, CheckCircle2, Search, ArrowRight, Lock, Sparkles } from 'lucide-react';
import apiClient from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';
import { useNavigate, useLocation } from 'react-router-dom';

export const SupportAccessPortal: React.FC = () => {
  const { startSupportSession } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const passedInstId = location.state?.institutionId || '';
  const passedInst = location.state?.institution || null;

  const [institutions, setInstitutions] = useState<any[]>([]);
  const [selectedInstId, setSelectedInstId] = useState<string>(passedInstId);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [ticketId, setTicketId] = useState<string>('');
  const [isReadOnly, setIsReadOnly] = useState<boolean>(false);

  const [loadingInsts, setLoadingInsts] = useState<boolean>(true);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [launching, setLaunching] = useState<boolean>(false);
  const [userSearch, setUserSearch] = useState<string>('');

  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        setLoadingInsts(true);
        const res = await apiClient.get('/institution');
        const list = res.data.data || [];
        setInstitutions(list);
        if (passedInstId && !selectedInstId) {
          setSelectedInstId(passedInstId);
        }
      } catch (err: any) {
        toast.error('Failed to load institutions');
      } finally {
        setLoadingInsts(false);
      }
    };
    fetchInstitutions();
  }, [passedInstId]);

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
          params: { institutionId: selectedInstId, pageSize: 100 }
        });
        const fetchedUsers = res.data.data || [];
        setUsers(fetchedUsers);
        
        // Smartly auto-select Primary Admin user belonging to this institution
        const instAdmin = fetchedUsers.find((u: any) => u.role === 'ADMIN');
        if (instAdmin) {
          setSelectedUserId(instAdmin.id);
        } else if (fetchedUsers.length > 0) {
          setSelectedUserId(fetchedUsers[0].id);
        }
      } catch (err: any) {
        toast.error('Failed to load institution users');
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, [selectedInstId]);

  const handleLaunchSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstId || !selectedUserId || !reason.trim() || reason.trim().length < 5) {
      toast.error('Please select an institution, target user, and enter a valid reason (min 5 chars)');
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

      toast.success(`Support access granted! Operating in ${isReadOnly ? 'Read-Only' : 'Full Access'} mode.`);
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to start support session');
    } finally {
      setLaunching(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      u.email.toLowerCase().includes(q) ||
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-fadeIn">
      {/* Header */}
      <div className="glass-card p-6 bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-3xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
        <div className="flex items-center gap-4">
          <div className="p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-2xl">
            <LifeBuoy className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Customer Support Access Portal</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Safely inspect and troubleshoot client accounts in read-only mode with full audit trailing.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleLaunchSupport} className="space-y-6 glass-card p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-xl">
        {/* Step 1: Institution Selection */}
        <div>
          <label className="block text-sm font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-500" />
            1. Select Target Institution *
          </label>
          <select
            value={selectedInstId}
            onChange={(e) => setSelectedInstId(e.target.value)}
            disabled={loadingInsts}
            className="input-field text-sm"
          >
            <option value="">-- Choose Institution --</option>
            {institutions.map((inst) => (
              <option key={inst.id} value={inst.id} disabled={!inst.isActive}>
                {inst.name} ({inst.slug}) {!inst.isActive ? '[SUSPENDED]' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Step 2: Target User Selection */}
        {selectedInstId && (
          <div className="animate-fadeIn space-y-3">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 rounded-2xl flex items-center justify-between text-xs animate-fadeIn">
              <div className="flex items-center gap-2 font-bold text-indigo-900 dark:text-indigo-200">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <span>
                  Smartly Selected: {institutions.find(i => i.id === selectedInstId)?.name || passedInst?.name || 'Selected Institution'}
                </span>
              </div>
              <span className="text-[10px] font-mono uppercase bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300 px-2.5 py-0.5 rounded-full font-extrabold">
                {users.length} Users Loaded
              </span>
            </div>

            <label className="block text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-500" />
              2. Select Target User (Admin, Teacher, Student, Guardian) *
            </label>

            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Filter users by name or email..."
                className="input-field pl-10 text-xs py-2"
              />
            </div>

            {loadingUsers ? (
              <div className="p-4 text-center text-xs text-slate-500 italic">Loading users...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 italic">No users found matching query.</div>
            ) : (
              <div className="max-h-56 overflow-y-auto border border-slate-200 dark:border-white/10 rounded-2xl divide-y divide-slate-100 dark:divide-white/5">
                {filteredUsers.map((u) => (
                  <label
                    key={u.id}
                    className={`flex items-center justify-between p-3 cursor-pointer transition-colors text-xs ${
                      selectedUserId === u.id
                        ? 'bg-blue-50 dark:bg-blue-500/10 border-l-4 border-blue-600'
                        : 'hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="targetUser"
                        value={u.id}
                        checked={selectedUserId === u.id}
                        onChange={() => setSelectedUserId(u.id)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">{u.firstName} {u.lastName}</p>
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
          </div>
        )}

        {/* Step 3: Support Reason & Ticket ID */}
        {selectedUserId && (
          <div className="animate-fadeIn space-y-4 pt-4 border-t border-slate-200 dark:border-white/5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Ticket ID / Reference (Optional)</label>
                <input
                  type="text"
                  value={ticketId}
                  onChange={(e) => setTicketId(e.target.value)}
                  placeholder="e.g. TICKET-9402"
                  className="input-field text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Access Mode *</label>
                <label className="flex items-center gap-2 p-3 bg-amber-50/50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isReadOnly}
                    onChange={(e) => setIsReadOnly(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-amber-900 dark:text-amber-200 block">Enforce Read-Only Mode (Recommended)</span>
                    <span className="text-slate-500 dark:text-slate-400">Blocks data modifications to protect client data</span>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Support Access Reason * (Required for Audit Log)</label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe why support access is requested (e.g., Customer reported fee billing discrepancy on invoice #104)..."
                className="input-field text-xs"
              />
            </div>

            {/* Launch Button */}
            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={launching}
                className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold px-8 py-3 rounded-2xl shadow-xl shadow-amber-500/20 transition-all text-sm min-h-[44px]"
              >
                <span>{launching ? 'Launching Session...' : 'Start Support Access Session'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

export default SupportAccessPortal;
