// =============================================================================
// P3: Bangla digits, money formatting and amount-in-words (English + Bangla),
// both using the South-Asian system: hundred / thousand / lakh / crore.
//   1200      → "One Thousand Two Hundred Taka Only" / "এক হাজার দুইশত টাকা মাত্র"
//   12345678  → "One Crore Twenty Three Lakh Forty Five Thousand Six Hundred
//                Seventy Eight Taka Only"
// =============================================================================

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** Replaces ASCII digits 0-9 with Bangla digits ০-৯ (everything else unchanged). */
export function toBanglaDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/** "1,23,456.00" — South-Asian grouping, always two decimals. */
export function formatAmount(n: number, banglaDigits = false): string {
  const neg = n < 0;
  const [intPart, frac] = Math.abs(Math.round(n * 100) / 100).toFixed(2).split('.');
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  const out = `${neg ? '-' : ''}${grouped}.${frac}`;
  return banglaDigits ? toBanglaDigits(out) : out;
}

// ── English ─────────────────────────────────────────────────────────────────
const EN_ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const EN_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function en99(n: number): string {
  if (n < 20) return EN_ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${EN_TENS[t]} ${EN_ONES[o]}` : EN_TENS[t];
}

function en999(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${EN_ONES[h]} Hundred` : '', r ? en99(r) : ''].filter(Boolean).join(' ');
}

/** Integer → English words in the lakh/crore system ("Zero" for 0). */
export function integerToWordsEn(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  if (crore) parts.push(`${integerToWordsEn(crore)} Crore`);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  if (lakh) parts.push(`${en99(lakh)} Lakh`);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  if (thousand) parts.push(`${en99(thousand)} Thousand`);
  n %= 1000;
  if (n) parts.push(en999(n));
  return parts.join(' ');
}

// ── Bangla ──────────────────────────────────────────────────────────────────
// Bangla has a distinct word for every number 0–99.
export const BN_0_99 = [
  'শূন্য', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়',
  'দশ', 'এগারো', 'বারো', 'তেরো', 'চৌদ্দ', 'পনেরো', 'ষোলো', 'সতেরো', 'আঠারো', 'উনিশ',
  'বিশ', 'একুশ', 'বাইশ', 'তেইশ', 'চব্বিশ', 'পঁচিশ', 'ছাব্বিশ', 'সাতাশ', 'আটাশ', 'ঊনত্রিশ',
  'ত্রিশ', 'একত্রিশ', 'বত্রিশ', 'তেত্রিশ', 'চৌত্রিশ', 'পঁয়ত্রিশ', 'ছত্রিশ', 'সাঁইত্রিশ', 'আটত্রিশ', 'ঊনচল্লিশ',
  'চল্লিশ', 'একচল্লিশ', 'বিয়াল্লিশ', 'তেতাল্লিশ', 'চুয়াল্লিশ', 'পঁয়তাল্লিশ', 'ছেচল্লিশ', 'সাতচল্লিশ', 'আটচল্লিশ', 'ঊনপঞ্চাশ',
  'পঞ্চাশ', 'একান্ন', 'বাহান্ন', 'তিপ্পান্ন', 'চুয়ান্ন', 'পঞ্চান্ন', 'ছাপ্পান্ন', 'সাতান্ন', 'আটান্ন', 'ঊনষাট',
  'ষাট', 'একষট্টি', 'বাষট্টি', 'তেষট্টি', 'চৌষট্টি', 'পঁয়ষট্টি', 'ছেষট্টি', 'সাতষট্টি', 'আটষট্টি', 'ঊনসত্তর',
  'সত্তর', 'একাত্তর', 'বাহাত্তর', 'তিয়াত্তর', 'চুয়াত্তর', 'পঁচাত্তর', 'ছিয়াত্তর', 'সাতাত্তর', 'আটাত্তর', 'ঊনআশি',
  'আশি', 'একাশি', 'বিরাশি', 'তিরাশি', 'চুরাশি', 'পঁচাশি', 'ছিয়াশি', 'সাতাশি', 'আটাশি', 'ঊননব্বই',
  'নব্বই', 'একানব্বই', 'বিরানব্বই', 'তিরানব্বই', 'চুরানব্বই', 'পঁচানব্বই', 'ছিয়ানব্বই', 'সাতানব্বই', 'আটানব্বই', 'নিরানব্বই',
];

/** Integer → Bangla words: কোটি / লক্ষ / হাজার / শত ("শূন্য" for 0). */
export function integerToWordsBn(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return BN_0_99[0];
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  if (crore) parts.push(`${integerToWordsBn(crore)} কোটি`);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  if (lakh) parts.push(`${BN_0_99[lakh]} লক্ষ`);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  if (thousand) parts.push(`${BN_0_99[thousand]} হাজার`);
  n %= 1000;
  const hundred = Math.floor(n / 100);
  if (hundred) parts.push(`${BN_0_99[hundred]}শত`);
  n %= 100;
  if (n) parts.push(BN_0_99[n]);
  return parts.join(' ');
}

function splitTakaPaisa(amount: number): { taka: number; paisa: number } {
  const paisaTotal = Math.round(Math.abs(amount) * 100);
  return { taka: Math.floor(paisaTotal / 100), paisa: paisaTotal % 100 };
}

/** "One Thousand Two Hundred Taka and Fifty Paisa Only". */
export function amountInWordsEn(amount: number): string {
  const { taka, paisa } = splitTakaPaisa(amount);
  const paisaPart = paisa ? ` and ${en99(paisa)} Paisa` : '';
  return `${integerToWordsEn(taka)} Taka${paisaPart} Only`;
}

/** "এক হাজার দুইশত টাকা পঞ্চাশ পয়সা মাত্র". */
export function amountInWordsBn(amount: number): string {
  const { taka, paisa } = splitTakaPaisa(amount);
  const paisaPart = paisa ? ` ${BN_0_99[paisa]} পয়সা` : '';
  return `${integerToWordsBn(taka)} টাকা${paisaPart} মাত্র`;
}
