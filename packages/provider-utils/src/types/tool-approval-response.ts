export type ToolApprovalResponse = {
  type: 'tool-approval-response';
  approvalId: string;

  /**
   * Flag indicating whether the approval was granted or denied.
   */
  approved: boolean;

  /**
   * Reason for the approval or denial.
   */
  reason?: string;
};
