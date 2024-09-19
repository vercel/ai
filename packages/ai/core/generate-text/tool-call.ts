import { CoreTool } from '../tool';
import { inferParameters } from '../tool/tool';
import { ValueOf } from '../util/value-of';

/**
Typed tool call that is returned by `generateText` and `streamText`.
It contains the tool call ID, the tool name, and the tool arguments.
 */
export interface ToolCall<NAME extends string, ARGS> {
  /**
ID of the tool call. This ID is used to match the tool call with the tool result.
 */
  toolCallId: string;

  /**
Name of the tool that is being called.
 */
  toolName: NAME;

  /**
Arguments of the tool call. This is a JSON-serializable object that matches the tool's input schema.
   */
  args: ARGS;
}

// transforms the tools into a tool call union
export type ToToolCall<TOOLS extends Record<string, CoreTool>> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-call';
    toolCallId: string;
    toolName: NAME & string;
    args: inferParameters<TOOLS[NAME]['parameters']>;
  };
}>;

export type ToToolCallArray<TOOLS extends Record<string, CoreTool>> = Array<
  ToToolCall<TOOLS>
>;
