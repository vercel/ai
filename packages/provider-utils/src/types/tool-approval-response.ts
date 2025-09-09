export type ToolApprovalResponse = {
  type: 'tool-approval-response';
  approvalId: string;
  approved: boolean;
  reason?: string;
};
