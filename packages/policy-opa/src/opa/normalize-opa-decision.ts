import type { PolicyDecision } from '../policy-decision';

/**
 * Normalize an OPA evaluation result into the package's {@link PolicyDecision}
 * shape.
 *
 * Supports two Rego output conventions:
 *
 * - **Recommended (explicit):** `{ "decision": "allow" | "deny" | "requires-approval", "reason": string }`.
 *   Maps to `approved` / `denied` / `user-approval` respectively.
 *
 * - **Legacy (boolean):** `{ "allow": boolean, "reason"?: string }`. `true`
 *   maps to `approved`, `false` to `denied`.
 *
 * `null` and `undefined` are treated as `not-applicable` so that a Rego rule
 * that does not match any branch defaults to "no opinion" rather than
 * blocking. Any other unrecognized result is denied so malformed policy
 * output cannot silently bypass the approval gate.
 */
export function normalizeOpaDecision(result: unknown): PolicyDecision {
  if (result == null) {
    return { type: 'not-applicable' };
  }

  if (typeof result !== 'object') {
    return unrecognizedDecision();
  }

  const record = result as Record<string, unknown>;
  const reason = typeof record.reason === 'string' ? record.reason : undefined;

  if (typeof record.decision === 'string') {
    switch (record.decision) {
      case 'allow':
        return withReason('approved', reason);
      case 'deny':
        return withReason('denied', reason);
      case 'requires-approval':
        return withReason('user-approval', reason);
      case 'not-applicable':
        return { type: 'not-applicable' };
    }
  }

  if (typeof record.allow === 'boolean') {
    return withReason(record.allow ? 'approved' : 'denied', reason);
  }

  return unrecognizedDecision();
}

function unrecognizedDecision(): PolicyDecision {
  return {
    type: 'denied',
    reason: 'unrecognized OPA policy decision',
  };
}

function withReason(
  type: 'approved' | 'denied' | 'user-approval',
  reason: string | undefined,
): PolicyDecision {
  return reason ? { type, reason } : { type };
}
