import type { JSONObject } from '@ai-sdk/provider';
import type { Tool } from '@ai-sdk/provider-utils';
import type { ProviderMetadata } from '../types';
import type { ValueOf } from '../util/value-of';
import type { ToolSet } from './tool-set';

const inputSchemaInputSymbol = Symbol('ai-sdk-tool-call-input-schema-input');

type BaseToolCall = {
  type: 'tool-call';
  toolCallId: string;
  providerExecuted?: boolean;
  providerMetadata?: ProviderMetadata;
  toolMetadata?: JSONObject;
};

export type StaticToolCall<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: BaseToolCall & {
    toolName: NAME & string;
    input: TOOLS[NAME] extends Tool<infer PARAMETERS> ? PARAMETERS : never;
    dynamic?: false | undefined;
    invalid?: false | undefined;
    error?: never;
    title?: string;
  };
}>;

export type DynamicToolCall = BaseToolCall & {
  toolName: string;
  input: unknown;
  dynamic: true;
  title?: string;

  /**
   * True if this is caused by an unparsable tool call or
   * a tool that does not exist.
   */
  // Added into DynamicToolCall to avoid breaking changes.
  // TODO AI SDK 6: separate into a new InvalidToolCall type
  invalid?: boolean;

  /**
   * The error that caused the tool call to be invalid.
   */
  // TODO AI SDK 6: separate into a new InvalidToolCall type
  error?: unknown;
};

export type TypedToolCall<TOOLS extends ToolSet> =
  | StaticToolCall<TOOLS>
  | DynamicToolCall;

export function setToolCallInputSchemaInput<TOOLS extends ToolSet>(
  toolCall: TypedToolCall<TOOLS>,
  inputSchemaInput: unknown,
): TypedToolCall<TOOLS> {
  Object.defineProperty(toolCall, inputSchemaInputSymbol, {
    value: inputSchemaInput,
  });
  return toolCall;
}

export function getToolCallInputSchemaInput<TOOLS extends ToolSet>(
  toolCall: TypedToolCall<TOOLS>,
): { value: unknown } | undefined {
  return inputSchemaInputSymbol in toolCall
    ? {
        value: (
          toolCall as TypedToolCall<TOOLS> & {
            [inputSchemaInputSymbol]: unknown;
          }
        )[inputSchemaInputSymbol],
      }
    : undefined;
}
