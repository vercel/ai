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
   * Name of the tool to approve.
   */
  toolName: string;

  /**
   * Input arguments for the tool call.
   */
  input: unknown;
};
