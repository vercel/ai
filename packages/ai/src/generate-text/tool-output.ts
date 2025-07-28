import { ValueOf } from '../../src/util/value-of';
import { InferToolInput, InferToolOutput } from '@ai-sdk/provider-utils';
import { ToolSet } from './tool-set';

// transforms the tools into a tool result union
type ToToolResultObject<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-result';
    toolCallId: string;
    toolName: NAME & string;
    input: InferToolInput<TOOLS[NAME]>;
    output: InferToolOutput<TOOLS[NAME]>;
    providerExecuted?: boolean;
    isDynamic?: boolean;
  };
}>;

export type ToolResultUnion<TOOLS extends ToolSet> = ToToolResultObject<TOOLS>;

export type ToolResultArray<TOOLS extends ToolSet> = Array<
  ToolResultUnion<TOOLS>
>;

type ToToolErrorObject<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-error';
    toolCallId: string;
    toolName: NAME & string;
    input: InferToolInput<TOOLS[NAME]>;
    error: unknown;
    providerExecuted?: boolean;
    isDynamic?: boolean;
  };
}>;

export type ToolErrorUnion<TOOLS extends ToolSet> = ToToolErrorObject<TOOLS>;

export type ToolOutput<TOOLS extends ToolSet> =
  | ToolResultUnion<TOOLS>
  | ToolErrorUnion<TOOLS>;
