// =============================================================================
// SMS length / segment counting — client-side port of the pure logic in
// backend/src/modules/campaigns/smsSegments.ts, so the composer can show a
// live counter without a round trip. Keep in sync with that file.
// =============================================================================
// A single SMS carries 140 bytes. With the GSM 03.38 7-bit alphabet that is
// 160 characters; any character outside it (Bangla, emoji, curly quotes...)
// forces the whole message into UCS-2, which fits only 70 characters.
// Concatenated (multi-part) messages lose a few characters per part to the
// UDH header: 153 per part for GSM, 67 per part for UCS-2.

import type { SmsEncoding, SmsSegmentInfo } from './campaigns.types';

const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

// Extension-table characters cost two septets each (escape + char).
const GSM_EXTENDED = '^{}\\[~]|€\f';

const GSM_BASIC_SET = new Set(Array.from(GSM_BASIC));
const GSM_EXTENDED_SET = new Set(Array.from(GSM_EXTENDED));

export function isGsmText(text: string): boolean {
  for (const ch of Array.from(text)) {
    if (!GSM_BASIC_SET.has(ch) && !GSM_EXTENDED_SET.has(ch)) return false;
  }
  return true;
}

export function countSmsSegments(text: string): SmsSegmentInfo {
  if (!text) {
    return { encoding: 'GSM' as SmsEncoding, length: 0, segments: 0, perSegment: 160, remaining: 160 };
  }

  if (isGsmText(text)) {
    let length = 0;
    for (const ch of Array.from(text)) length += GSM_EXTENDED_SET.has(ch) ? 2 : 1;
    const single = 160;
    const multi = 153;
    const segments = length <= single ? 1 : Math.ceil(length / multi);
    const perSegment = segments === 1 ? single : multi;
    return { encoding: 'GSM', length, segments, perSegment, remaining: segments * perSegment - length };
  }

  // UCS-2 counts UTF-16 code units — an emoji (surrogate pair) costs two.
  const length = text.length;
  const single = 70;
  const multi = 67;
  const segments = length <= single ? 1 : Math.ceil(length / multi);
  const perSegment = segments === 1 ? single : multi;
  return { encoding: 'UNICODE', length, segments, perSegment, remaining: segments * perSegment - length };
}
