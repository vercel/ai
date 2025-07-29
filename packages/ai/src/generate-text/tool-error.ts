import { InferToolInput } from '@ai-sdk/provider-utils';
import { ValueOf } from '../util/value-of';
import { ToolSet } from './tool-set';

export type StaticToolError<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-error';
    toolCallId: string;
    toolName: NAME & string;
    input: InferToolInput<TOOLS[NAME]>;
    error: unknown;
    providerExecuted?: boolean;
    dynamic?: false | undefined;
  };
}>;

export type DynamicToolError = {
  type: 'tool-error';
  toolCallId: string;
  toolName: string;
  input: unknown;
  error: unknown;
  providerExecuted?: boolean;
  dynamic: true;
};

export type TypedToolError<TOOLS extends ToolSet> =
  | StaticToolError<TOOLS>
  | DynamicToolError;
