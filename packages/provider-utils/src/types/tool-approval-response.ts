/**
 * Tool approval response prompt part.
 */
export type ToolApprovalResponse<DATA = unknown> = {
  type: 'tool-approval-response';

  /**
   * ID of the tool approval.
   */
  approvalId: string;

  /**
   * Flag indicating whether the approval was granted or denied.
   */
  approved: boolean;

  /**
   * Optional reason for the approval or denial.
   */
  reason?: string;

  /**
   * Flag indicating whether the tool call is provider-executed.
   * Only provider-executed tool approval responses should be sent to the model.
   */
  providerExecuted?: boolean;

  /**
   * Optional extra data provided with the approval response.
   * This data is passed to the tool's execute function when the tool is approved.
   * Can be used for user input during approval (e.g., confirmation notes, options).
   */
  data?: DATA;
};
