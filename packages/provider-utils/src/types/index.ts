export type {
  AssistantContent,
  AssistantModelMessage,
} from './assistant-model-message';
export type {
  CustomPart,
  FilePart,
  ImagePart,
  ReasoningFilePart,
  ReasoningPart,
  TextPart,
  ToolCallPart,
  ToolResultOutput,
  ToolResultPart,
} from './content-part';
export type { Context } from './context';
export type { DataContent } from './data-content';
export { executeTool } from './execute-tool';
export type { ModelMessage } from './model-message';
export type { ProviderOptions } from './provider-options';
export type { SystemModelMessage } from './system-model-message';
export {
  dynamicTool,
  tool,
  type InferToolContext,
  type InferToolInput,
  type InferToolOutput,
  type Tool,
  type ToolExecuteFunction,
  type ToolExecutionOptions,
  type ToolNeedsApprovalFunction,
} from './tool';
export type { ToolApprovalRequest } from './tool-approval-request';
export type { ToolApprovalResponse } from './tool-approval-response';
export type { ToolCall } from './tool-call';
export type { ToolContent, ToolModelMessage } from './tool-model-message';
export type { ToolResult } from './tool-result';
export type { UserContent, UserModelMessage } from './user-model-message';

import type { Context } from './context';
import type { ToolExecutionOptions } from './tool';

/**
 * @deprecated Use ToolExecutionOptions instead.
 */
export type ToolCallOptions<CONTEXT extends Context> =
  ToolExecutionOptions<CONTEXT>;
