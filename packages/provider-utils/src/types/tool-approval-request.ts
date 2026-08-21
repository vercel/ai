import type { JSONValue } from '@ai-sdk/provider';

/**
 * Tool approval request prompt part.
 */
export type ToolApprovalRequest = {
  type: 'tool-approval-request';

  /**
   * ID of the tool approval.
   */
  approvalId: string;

  /**
   * ID of the tool call that the approval request is for.
   */
  toolCallId: string;

  /**
   * Flag indicating whether the tool was automatically approved or denied.
   *
   * @default false
   */
  isAutomatic?: boolean;

  /**
   * HMAC-SHA256 signature binding this approval to its tool call.
   * Present only when `experimental_toolApprovalSecret` is configured.
   */
  signature?: string;

  /**
   * Dynamic, per-call context for the approval card (blast radius,
   * consequence summary, etc.). Bound to this approval id and tool call.
   */
  context?: JSONValue;

  /**
   * Canonical digest of the tool input at the time this context was issued.
   * Present when `context` is set. Replay rejects a mismatched digest as stale.
   */
  inputDigest?: string;
};
