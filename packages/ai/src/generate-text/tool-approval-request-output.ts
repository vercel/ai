import { ContextRegistry } from '@ai-sdk/provider-utils';
import { TypedToolCall } from './tool-call';
import { ToolSet } from './tool-set';

/**
 * Output part that indicates that a tool approval request has been made.
 *
 * The tool approval request can be approved or denied in the next tool message.
 */
export type ToolApprovalRequestOutput<
  CONTEXT extends Partial<ContextRegistry>,
  TOOLS extends ToolSet<CONTEXT> = ToolSet<CONTEXT>,
> = {
  type: 'tool-approval-request';

  /**
   * ID of the tool approval request.
   */
  approvalId: string;

  /**
   * Tool call that the approval request is for.
   */
  toolCall: TypedToolCall<CONTEXT, TOOLS>;
};
