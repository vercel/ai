import { Tool } from '@ai-sdk/provider-utils';
import { ValueOf } from '../../src/util/value-of';
import { ProviderMetadata } from '../types';
import { ToolSet } from './tool-set';

export type StaticToolCall<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-call';
    toolCallId: string;
    toolName: NAME & string;
    input: TOOLS[NAME] extends Tool<infer PARAMETERS> ? PARAMETERS : never;
    providerExecuted?: boolean;
    dynamic?: false | undefined;
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
};

export type TypedToolCall<TOOLS extends ToolSet> =
  | StaticToolCall<TOOLS>
  | DynamicToolCall;
