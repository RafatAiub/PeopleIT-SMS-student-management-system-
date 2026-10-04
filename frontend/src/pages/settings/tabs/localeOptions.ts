import type { DateFormat } from '@/i18n';

// A short, curated list — this product's primary market is Bangladesh, with
// a couple of neighbouring/common zones for institutions with overseas staff.
export const TIME_ZONES = [
  { value: 'Asia/Dhaka', label: 'Dhaka (GMT+6)' },
  { value: 'Asia/Kolkata', label: 'Kolkata (GMT+5:30)' },
  { value: 'Asia/Kathmandu', label: 'Kathmandu (GMT+5:45)' },
  { value: 'Asia/Yangon', label: 'Yangon (GMT+6:30)' },
  { value: 'Asia/Dubai', label: 'Dubai (GMT+4)' },
  { value: 'UTC', label: 'UTC' },
];

export const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: 'D MMM YYYY', label: '5 Jan 2026' },
  { value: 'DD/MM/YYYY', label: '05/01/2026' },
  { value: 'MM/DD/YYYY', label: '01/05/2026' },
  { value: 'YYYY-MM-DD', label: '2026-01-05' },
];

export const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'bn', label: 'বাংলা (Bangla)' },
];

export const NUMERAL_OPTIONS = [
  { value: 'latn', label: '1, 2, 3 (Latin)' },
  { value: 'beng', label: '১, ২, ৩ (Bangla)' },
];

export const CURRENCY_OPTIONS = [
  { value: 'BDT', label: 'BDT — Bangladeshi Taka (৳)' },
  { value: 'INR', label: 'INR — Indian Rupee (₹)' },
  { value: 'NPR', label: 'NPR — Nepalese Rupee' },
  { value: 'USD', label: 'USD — US Dollar ($)' },
  { value: 'AED', label: 'AED — UAE Dirham' },
  { value: 'GBP', label: 'GBP — British Pound (£)' },
];
