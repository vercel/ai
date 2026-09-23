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
   * HMAC-SHA256 signature binding this approval to its tool call.
   * Present only when `experimental_toolApprovalSecret` is configured.
   */
  signature?: string;

  /**
   * Tool input before input schema validation and transformation.
   *
   * This is included when it differs from the validated tool input so that
   * approved tool calls can be safely revalidated before execution.
   */
  inputSchemaInput?: unknown;
};
