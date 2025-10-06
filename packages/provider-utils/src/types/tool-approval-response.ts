/**
 * Tool approval response prompt part.
 */
export type ToolApprovalResponse = {
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
};
