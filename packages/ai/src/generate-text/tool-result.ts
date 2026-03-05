import {
  ContextRegistry,
  InferToolInput,
  InferToolOutput,
} from '@ai-sdk/provider-utils';
import { ProviderMetadata } from '../types';
import { ValueOf } from '../../src/util/value-of';
import { ToolSet } from './tool-set';

export type StaticToolResult<
  CONTEXT extends Partial<ContextRegistry>,
  TOOLS extends ToolSet<CONTEXT> = ToolSet<CONTEXT>,
> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-result';
    toolCallId: string;
    toolName: NAME & string;
    input: InferToolInput<CONTEXT, TOOLS[NAME]>;
    output: InferToolOutput<CONTEXT, TOOLS[NAME]>;
    providerExecuted?: boolean;
    providerMetadata?: ProviderMetadata;
    dynamic?: false | undefined;
    preliminary?: boolean;
    title?: string;
  };
}>;

export type DynamicToolResult = {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
  providerExecuted?: boolean;
  providerMetadata?: ProviderMetadata;
  dynamic: true;
  preliminary?: boolean;
  title?: string;
};

export type TypedToolResult<
  CONTEXT extends Partial<ContextRegistry>,
  TOOLS extends ToolSet<CONTEXT> = ToolSet<CONTEXT>,
> = StaticToolResult<CONTEXT, TOOLS> | DynamicToolResult;
