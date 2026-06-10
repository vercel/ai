import type { TypedToolCall } from './tool-call';
import type { ToolSet } from './tool-set';

/**
 * Output part that indicates that a tool approval request has been made.
 *
 * The tool approval request can be approved or denied in the next tool message.
 */
export type ToolApprovalRequestOutput<TOOLS extends ToolSet> = {
  type: 'tool-approval-request';

  /**
   * ID of the tool approval request.
   */
  approvalId: string;

  /**
   * Tool call that the approval request is for.
   */
  toolCall: TypedToolCall<TOOLS>;
<<<<<<< HEAD
=======

  /**
   * Flag indicating whether the tool was automatically approved or denied.
   *
   * @default false
   */
  isAutomatic?: boolean;

  /**
   * HMAC-SHA256 signature binding this approval request to its tool call.
   */
  signature?: string;
>>>>>>> bae5e2b63f (fix(security): harden tool approval replay path against client-forged approvals (#15947))
};
