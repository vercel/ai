import type { ToolApprovalStatus } from 'ai';

/**
 * A literal approval status that a caller can use as the fallback for tool
 * calls an approval has no opinion about.
 */
export type ApprovalFallbackStatus = Extract<ToolApprovalStatus, string>;

/**
 * Internal, symbol-keyed hook on the approval function that {@link opaPolicy}
 * returns.
 *
 * `wrapMcpTools` falls back to a configurable status for tool calls an
 * approval does not handle. Applying that fallback to the final status of an
 * `opaPolicy` approval is too late: an approval function that does not use
 * OPA combines the decisions of more than one evaluation for one tool call
 * (with and without the earlier tool calls of the same response). With a
 * fallback of `denied`, a `user-approval` from the evaluation with the earlier
 * tool calls would otherwise lift a `not-applicable` evaluation that the
 * fallback turns into a denial.
 *
 * The hook therefore takes the fallback and returns an approval function that
 * applies it to every evaluation, before the decisions are compared. The hook
 * is internal plumbing between this package's helpers; it is not part of the
 * public API.
 */
export const applyApprovalFallback = Symbol.for(
  'vercel.ai.policy-opa.applyApprovalFallback',
);

export type ApprovalFallbackHook<APPROVAL> = (
  fallback: ApprovalFallbackStatus,
) => APPROVAL;

/**
 * Returns the fallback hook of an approval function, if it has one.
 */
export function getApprovalFallbackHook<APPROVAL>(
  approval: unknown,
): ApprovalFallbackHook<APPROVAL> | undefined {
  if (approval == null) return undefined;
  if (typeof approval !== 'function' && typeof approval !== 'object') {
    return undefined;
  }

  const hook = (approval as Record<symbol, unknown>)[applyApprovalFallback];
  return typeof hook === 'function'
    ? (hook as ApprovalFallbackHook<APPROVAL>).bind(approval)
    : undefined;
}
