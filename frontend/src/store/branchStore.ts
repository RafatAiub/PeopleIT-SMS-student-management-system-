import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Selected branch for the header branch switcher (admins of multi-branch
 * institutions). `null` = all branches. Keyed by institution so switching
 * accounts on one browser never carries a branch across tenants.
 *
 * api/client.ts sends the selection as `X-Branch-Id`; the backend only
 * honours it on endpoints that opt in (see backend branches/branch.scope.ts)
 * and always re-validates it against the caller's tenant.
 */
interface BranchState {
  institutionId: string | null;
  branchId: string | null;
  branchName: string | null;
  setBranch: (institutionId: string, branchId: string | null, branchName?: string | null) => void;
  clear: () => void;
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      institutionId: null,
      branchId: null,
      branchName: null,
      setBranch: (institutionId, branchId, branchName = null) =>
        set({ institutionId, branchId, branchName: branchId ? branchName : null }),
      clear: () => set({ institutionId: null, branchId: null, branchName: null }),
    }),
    { name: 'branch-storage' }
  )
);

/** The branch id to send for this institution, or null. */
export function selectedBranchFor(institutionId: string | null | undefined): string | null {
  const s = useBranchStore.getState();
  return institutionId && s.institutionId === institutionId ? s.branchId : null;
}
