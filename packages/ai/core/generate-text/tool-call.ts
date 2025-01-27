import { Tool } from '../tool';
import { inferParameters } from '../tool/tool';
import { ValueOf } from '../util/value-of';

export type { CoreToolCall, ToolCall } from '@ai-sdk/provider-utils';

// transforms the tools into a tool call union
export type ToolCallUnion<TOOLS extends Record<string, Tool>> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-call';
    toolCallId: string;
    toolName: NAME & string;
    args: inferParameters<TOOLS[NAME]['parameters']>;
  };
}>;

/**
 * @deprecated Use `ToolCallUnion` instead.
 */
// TODO remove in v5
export type CoreToolCallUnion<TOOLS extends Record<string, Tool>> =
  ToolCallUnion<Record<string, Tool>>;

export type ToolCallArray<TOOLS extends Record<string, Tool>> = Array<
  ToolCallUnion<TOOLS>
>;
