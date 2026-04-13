import { InferToolInput } from '@ai-sdk/provider-utils';
import { ProviderMetadata } from '../types';
import { ValueOf } from '../util/value-of';
import type { ToolSet } from '@ai-sdk/provider-utils';

type BaseToolCall = {
  type: 'tool-call';
  title?: string;
  toolCallId: string;
  providerExecuted?: boolean;
  providerMetadata?: ProviderMetadata;
};

/**
 * A tool call whose `toolName` maps to a tool in the declared tool set,
 * with an `input` type inferred from that tool's input schema.
 */
export type StaticToolCall<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: BaseToolCall & {
    toolName: NAME & string;
    input: InferToolInput<TOOLS[NAME]>;
    dynamic?: false | undefined;
    invalid?: false | undefined;
    error?: never;
  };
}>;

/**
 * A tool call whose `toolName` is only known at runtime,
 * e.g. MCP tools or other dynamically defined tools.
 */
export type DynamicToolCall = BaseToolCall & {
  toolName: string;
  input: unknown;
  dynamic: true;
  invalid?: false | undefined;
  error?: never;
};

/**
 * A tool call that failed validation: either the tool does not exist
 * (`NoSuchToolError`) or the model produced input that does not match
 * the tool's schema (`InvalidToolInputError`).
 */
export type InvalidToolCall = BaseToolCall & {
  toolName: string;
  rawInput: string;
  input: unknown;
  invalid: true;
  dynamic?: boolean;
  error: unknown;
};

/**
 * A tool call returned by text generation, either statically typed from the
 * declared tool set, dynamically typed, or invalid.
 */
export type TypedToolCall<TOOLS extends ToolSet> =
  | StaticToolCall<TOOLS>
  | DynamicToolCall
  | InvalidToolCall;
