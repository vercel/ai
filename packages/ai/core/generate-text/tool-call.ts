import { Tool } from '../tool';
import { ValueOf } from '../util/value-of';
import { ToolSet } from './tool-set';

export type { CoreToolCall, ToolCall } from '@ai-sdk/provider-utils';

// transforms the tools into a tool call union
export type ToolCallUnion<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-call';
    toolCallId: string;
    toolName: NAME & string;
    args: TOOLS[NAME] extends Tool<infer PARAMETERS> ? PARAMETERS : never;
  };
}>;

export type ToolCallArray<TOOLS extends ToolSet> = Array<ToolCallUnion<TOOLS>>;
