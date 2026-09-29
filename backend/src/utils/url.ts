import { z } from 'zod';

// =============================================================================
// Shared "safe URL" zod schema — rejects `javascript:`, `data:`, `vbscript:`
// and any other non-http(s) scheme so user-supplied links can never be
// rendered/clicked as an XSS vector on the frontend.
// =============================================================================

/**
 * A zod string schema that requires a syntactically valid URL AND restricts
 * the protocol to http/https. Use in place of `z.string().url()` for any
 * field a user supplies that the frontend will later render as a link
 * (file URLs, website links, etc).
 */
export function httpUrl(message = 'Must be a valid http(s) URL') {
  return z.string().url(message).refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, { message });
}
