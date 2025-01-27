import { Tool } from '../tool';
import { inferParameters } from '../tool/tool';
import { ValueOf } from '../util/value-of';

export type { ToolCall } from '@ai-sdk/provider-utils';

// transforms the tools into a tool call union
export type ToolCallUnion<TOOLS extends Record<string, Tool>> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-call';
    toolCallId: string;
    toolName: NAME & string;
    args: inferParameters<TOOLS[NAME]['parameters']>;
  };
}>;

export type ToolCallArray<TOOLS extends Record<string, Tool>> = Array<
  ToolCallUnion<TOOLS>
>;
