/**
 * T1 donations — public website types, response normalisers and pure
 * helpers for the Donate / Campaign progress blocks and the
 * `donation/<reference>` status page. No React here (unit-tested in
 * src/site/__tests__/donations-logic.test.ts).
 */

export type DonationFundType = 'ZAKAT' | 'SADAQAH' | 'WAQF' | 'LILLAH' | 'BUILDING' | 'GENERAL' | 'OTHER';
export type PublicDonationStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface PublicDonationFund {
  id: string;
  name: string;
  nameBn?: string;
  type: DonationFundType;
  description?: string;
  goalAmount: number | null;
  raised: number;
  progress: number | null;
}

export interface PublicDonationCampaign {
  id: string;
  title: string;
  titleBn?: string;
  description?: string;
  goalAmount: number | null;
  raised: number;
  progress: number | null;
  startDate?: string;
  endDate?: string;
  coverImageUrl?: string;
  ended: boolean;
  upcoming: boolean;
  fund: { id: string; name: string; nameBn?: string; type: DonationFundType };
}

export interface DonationGateway {
  gateway: 'BKASH' | 'NAGAD' | 'SSLCOMMERZ';
  label: string;
  live: boolean;
  demo: boolean;
}

export interface DonationOptions {
  currency: string;
  funds: PublicDonationFund[];
  campaigns: PublicDonationCampaign[];
  gateways: DonationGateway[];
}

export interface PublicDonation {
  reference: string;
  status: PublicDonationStatus;
  amount: number;
  currency: string;
  method: string;
  isDemo: boolean;
  receiptNo: string | null;
  paidAt?: string;
  donorName?: string;
  fund: { name: string; nameBn?: string };
  campaign?: { title: string; titleBn?: string } | null;
  createdAt?: string;
}

export interface CreateDonationInput {
  fundId?: string;
  campaignId?: string;
  amount: number;
  name?: string;
  phone?: string;
  email?: string;
  anonymous?: boolean;
  paymentMethod: DonationGateway['gateway'];
  returnUrl?: string;
  note?: string;
}

export interface CreateDonationResult {
  donation: PublicDonation;
  paymentUrl?: string;
  demo: boolean;
}

/* ── Normalisers (tolerant of missing fields) ────────────────────────────── */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const FUND_TYPES: DonationFundType[] = ['ZAKAT', 'SADAQAH', 'WAQF', 'LILLAH', 'BUILDING', 'GENERAL', 'OTHER'];
const fundType = (v: unknown): DonationFundType => (FUND_TYPES.includes(v as DonationFundType) ? (v as DonationFundType) : 'OTHER');

export function normaliseDonationOptions(raw: unknown): DonationOptions {
  const o = obj(raw);
  return {
    currency: str(o.currency) ?? 'BDT',
    funds: arr(o.funds).map((f) => ({
      id: String(f.id ?? ''),
      name: String(f.name ?? ''),
      nameBn: str(f.nameBn),
      type: fundType(f.type),
      description: str(f.description),
      goalAmount: num(f.goalAmount),
      raised: num(f.raised) ?? 0,
      progress: num(f.progress),
    })),
    campaigns: arr(o.campaigns).map((c) => {
      const fund = obj(c.fund);
      return {
        id: String(c.id ?? ''),
        title: String(c.title ?? ''),
        titleBn: str(c.titleBn),
        description: str(c.description),
        goalAmount: num(c.goalAmount),
        raised: num(c.raised) ?? 0,
        progress: num(c.progress),
        startDate: str(c.startDate),
        endDate: str(c.endDate),
        coverImageUrl: str(c.coverImageUrl),
        ended: c.ended === true,
        upcoming: c.upcoming === true,
        fund: { id: String(fund.id ?? ''), name: String(fund.name ?? ''), nameBn: str(fund.nameBn), type: fundType(fund.type) },
      };
    }),
    gateways: arr(o.gateways)
      .filter((g) => g.gateway === 'BKASH' || g.gateway === 'NAGAD' || g.gateway === 'SSLCOMMERZ')
      .map((g) => ({ gateway: g.gateway as DonationGateway['gateway'], label: String(g.label ?? g.gateway), live: g.live === true, demo: g.demo === true })),
  };
}

export function normalisePublicDonation(raw: unknown): PublicDonation {
  const o = obj(raw);
  const fund = obj(o.fund);
  const campaign = o.campaign ? obj(o.campaign) : null;
  const status = String(o.status ?? 'PENDING');
  return {
    reference: String(o.reference ?? ''),
    status: (['PENDING', 'PAID', 'FAILED', 'REFUNDED'].includes(status) ? status : 'PENDING') as PublicDonationStatus,
    amount: num(o.amount) ?? 0,
    currency: str(o.currency) ?? 'BDT',
    method: String(o.method ?? ''),
    isDemo: o.isDemo === true,
    receiptNo: str(o.receiptNo) ?? null,
    paidAt: str(o.paidAt),
    donorName: str(o.donorName),
    fund: { name: String(fund.name ?? ''), nameBn: str(fund.nameBn) },
    campaign: campaign ? { title: String(campaign.title ?? ''), titleBn: str(campaign.titleBn) } : null,
    createdAt: str(o.createdAt),
  };
}

/* ── Pure helpers ────────────────────────────────────────────────────────── */

/** "500, 1000, 5000" → [500, 1000, 5000] (positive, unique, max 6, in order given). */
export function parsePresetAmounts(raw: unknown, fallback: number[] = [500, 1000, 2000, 5000]): number[] {
  const parts = String(raw ?? '')
    .split(/[\s,]+/)
    .map((p) => Number(p.replace(/[^\d.]/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
  const unique = [...new Set(parts)].slice(0, 6);
  return unique.length ? unique : fallback;
}

/** Amount entered by the visitor → a valid gift (positive, ≤ 1 crore, 2 decimals) or an error key. */
export function validateDonationAmount(raw: string | number, min = 10): { ok: true; amount: number } | { ok: false; error: string } {
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[,\s]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'Enter an amount' };
  if (n < min) return { ok: false, error: 'The minimum donation is {min}' };
  if (n > 10_000_000) return { ok: false, error: 'That amount is too large for an online donation' };
  return { ok: true, amount: Math.round(n * 100) / 100 };
}

/** Progress bar width: 0–100, or null when there is no goal. */
export function progressWidth(raised: number, goal: number | null | undefined): number | null {
  if (goal == null || !(goal > 0)) return null;
  return Math.max(0, Math.min(100, Math.round((raised / goal) * 100)));
}

/** Which campaign a "Campaign progress" block shows: the chosen id, else the newest running public one. */
export function pickCampaign(campaigns: PublicDonationCampaign[], id?: string): PublicDonationCampaign | null {
  if (id) return campaigns.find((c) => c.id === id) ?? null;
  return campaigns.find((c) => !c.ended && !c.upcoming) ?? campaigns[0] ?? null;
}

export const FUND_TYPE_LABEL: Record<DonationFundType, { en: string; bn: string }> = {
  ZAKAT: { en: 'Zakat', bn: 'যাকাত' },
  SADAQAH: { en: 'Sadaqah', bn: 'সদকা' },
  WAQF: { en: 'Waqf', bn: 'ওয়াকফ' },
  LILLAH: { en: 'Lillah', bn: 'লিল্লাহ' },
  BUILDING: { en: 'Building', bn: 'নির্মাণ' },
  GENERAL: { en: 'General', bn: 'সাধারণ' },
  OTHER: { en: 'Other', bn: 'অন্যান্য' },
};
