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
<<<<<<< HEAD
=======

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
>>>>>>> bae5e2b63f (fix(security): harden tool approval replay path against client-forged approvals (#15947))
};
