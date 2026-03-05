import { ContextRegistry, InferToolInput } from '@ai-sdk/provider-utils';
import { ProviderMetadata } from '../types';
import { ValueOf } from '../util/value-of';
import { ToolSet } from './tool-set';

export type StaticToolError<
  CONTEXT extends Partial<ContextRegistry>,
  TOOLS extends ToolSet<CONTEXT> = ToolSet<CONTEXT>,
> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-error';
    toolCallId: string;
    toolName: NAME & string;
    input: InferToolInput<CONTEXT, TOOLS[NAME]>;
    error: unknown;
    providerExecuted?: boolean;
    providerMetadata?: ProviderMetadata;
    dynamic?: false | undefined;
    title?: string;
  };
}>;

export type DynamicToolError = {
  type: 'tool-error';
  toolCallId: string;
  toolName: string;
  input: unknown;
  error: unknown;
  providerExecuted?: boolean;
  providerMetadata?: ProviderMetadata;
  dynamic: true;
  title?: string;
};

export type TypedToolError<
  CONTEXT extends Partial<ContextRegistry>,
  TOOLS extends ToolSet<CONTEXT> = ToolSet<CONTEXT>,
> = StaticToolError<TOOLS> | DynamicToolError;
