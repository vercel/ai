import { ValueOf } from '../../src/util/value-of';
import { InferToolInput } from '@ai-sdk/provider-utils';
import { ToolSet } from './tool-set';
import { TypedToolResult } from './tool-result';

type ToToolErrorObject<TOOLS extends ToolSet> =
  | ValueOf<{
      [NAME in keyof TOOLS]: {
        type: 'tool-error';
        toolCallId: string;
        toolName: NAME & string;
        input: InferToolInput<TOOLS[NAME]>;
        error: unknown;
        providerExecuted?: boolean;
        dynamic?: false | undefined;
      };
    }>
  | {
      type: 'tool-error';
      toolCallId: string;
      toolName: string;
      input: unknown;
      error: unknown;
      providerExecuted?: boolean;
      dynamic: true;
    };

export type ToolErrorUnion<TOOLS extends ToolSet> = ToToolErrorObject<TOOLS>;

export type ToolOutput<TOOLS extends ToolSet> =
  | TypedToolResult<TOOLS>
  | ToolErrorUnion<TOOLS>;
