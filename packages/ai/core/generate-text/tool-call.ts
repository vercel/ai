import { ValueOf } from '../../src/util/value-of';
import { Tool } from '../tool';
import { ToolSet } from './tool-set';

export type { ToolCall } from '@ai-sdk/provider-utils';

// transforms the tools into a tool call union
export type ToolCallUnion<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-call';
    toolCallId: string;
    toolName: NAME & string;
    input: TOOLS[NAME] extends Tool<infer PARAMETERS> ? PARAMETERS : never;
  };
}>;

export type ToolCallArray<TOOLS extends ToolSet> = Array<ToolCallUnion<TOOLS>>;
