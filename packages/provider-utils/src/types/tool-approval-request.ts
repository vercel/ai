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
   * Reason why the tool call requires approval.
   */
  reason?: string;

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
   * Tool input before input schema validation and transformation.
   *
   * This is included when it differs from the validated tool input so that
   * approved tool calls can be safely revalidated before execution.
   */
  inputSchemaInput?: unknown;
};
