import { TypedToolCall } from './tool-call';
import { ToolSet } from './tool-set';

export type ToolApprovalRequestOutput<TOOLS extends ToolSet> = {
  type: 'tool-approval-request';
  approvalId: string;
  toolCall: TypedToolCall<TOOLS>;
};
