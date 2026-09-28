// =============================================================================
// Pure decision: DNS check + provider status → the SiteDomain status to store.
// =============================================================================

import type { ProviderStatus } from './provider';

export type DomainStatus = 'PENDING_DNS' | 'VERIFYING' | 'ACTIVE' | 'FAILED';

/** A domain whose DNS never appears is marked FAILED after this long (re-verify revives it). */
export const DNS_GIVE_UP_MS = 14 * 24 * 60 * 60 * 1000;

export interface DecideInput {
  dnsOk: boolean;
  dnsDetail: string;
  provider: ProviderStatus | null;
  providerError?: string | null;
  createdAt: Date;
  now: Date;
  /** Manual verification (no automatic retry cut-off). */
  manualCheck?: boolean;
}

export interface DecideOutput {
  status: DomainStatus;
  error: string | null;
}

export function decideDomainStatus(input: DecideInput): DecideOutput {
  if (input.providerError) {
    return { status: input.dnsOk ? 'VERIFYING' : 'PENDING_DNS', error: input.providerError };
  }
  const p = input.provider ?? { state: 'dns' as const };
  if (p.state === 'failed') return { status: 'FAILED', error: p.detail ?? 'The domain provider rejected this domain' };
  if (p.state === 'active') return { status: 'ACTIVE', error: null };

  if (!input.dnsOk) {
    const tooOld = input.now.getTime() - input.createdAt.getTime() > DNS_GIVE_UP_MS;
    if (tooOld && !input.manualCheck) {
      return { status: 'FAILED', error: `DNS records were not found within 14 days. ${input.dnsDetail}` };
    }
    return { status: 'PENDING_DNS', error: input.dnsDetail };
  }
  if (p.state === 'pending') return { status: 'VERIFYING', error: p.detail ?? 'Waiting for the provider to issue SSL' };
  return { status: 'ACTIVE', error: null };
}
