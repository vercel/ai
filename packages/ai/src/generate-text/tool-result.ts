import { InferToolInput, InferToolOutput } from '@ai-sdk/provider-utils';
import { ValueOf } from '../../src/util/value-of';
import { ToolSet } from './tool-set';

export type StaticToolResult<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-result';
    toolCallId: string;
    toolName: NAME & string;
    input: InferToolInput<TOOLS[NAME]>;
    output: InferToolOutput<TOOLS[NAME]>;
    providerExecuted?: boolean;
    dynamic?: false | undefined;
  };
}>;

export type DynamicToolResult = {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
  providerExecuted?: boolean;
  dynamic: true;
};

export type TypedToolResult<TOOLS extends ToolSet> =
  | StaticToolResult<TOOLS>
  | DynamicToolResult;
