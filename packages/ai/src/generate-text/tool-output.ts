import { InferToolInput } from '@ai-sdk/provider-utils';
import { ValueOf } from '../util/value-of';
import { TypedToolResult } from './tool-result';
import { ToolSet } from './tool-set';

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
