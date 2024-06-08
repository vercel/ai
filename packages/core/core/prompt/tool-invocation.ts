import { ToolCall } from '../generate-text/tool-call';
import { ToolResult } from '../generate-text/tool-result';

/**
Tool invocations are either tool calls or tool results. For each assistant tool call,
there is one tool invocation. While the call is in progress, the invocation is a tool call.
Once the call is complete, the invocation is a tool result.
 */
export type ToolInvocation =
  | ToolCall<string, any>
  | ToolResult<string, any, any>;
