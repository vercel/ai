import { Tool } from '@ai-sdk/provider-utils';
import { ProviderMetadata } from '../types';
import { ValueOf } from '../util/value-of';
import { ToolSet } from './tool-set';

export type StaticToolCall<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-call';
    toolCallId: string;
    toolName: NAME & string;
    input: TOOLS[NAME] extends Tool<infer PARAMETERS> ? PARAMETERS : never;
    providerExecuted?: boolean;
    dynamic?: false | undefined;
    invalid?: false | undefined;
    error?: never;
    providerMetadata?: ProviderMetadata;
  };
}>;

export type DynamicToolCall = {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  input: unknown;
  providerExecuted?: boolean;
  dynamic: true;
  providerMetadata?: ProviderMetadata;

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
