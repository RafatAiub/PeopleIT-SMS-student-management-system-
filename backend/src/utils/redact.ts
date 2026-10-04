// =============================================================================
// Recursive redaction helper — used to keep secrets (passwords, tokens, OTPs,
// etc.) out of audit log metadata, error logs, or anywhere else request
// bodies get persisted verbatim.
// =============================================================================

const SENSITIVE_KEY_PATTERN = /pass(word)?|secret|token|otp|code|pin|totp|backup/i;

/**
 * Deep-clones a value while replacing any object property whose key matches
 * SENSITIVE_KEY_PATTERN with the literal string '[REDACTED]'. Arrays and
 * nested objects are walked recursively; primitives are returned as-is.
 */
export function redactSensitive<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item)) as unknown as T;
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactSensitive(val);
      }
    }
    return result as unknown as T;
  }

  return value;
}
