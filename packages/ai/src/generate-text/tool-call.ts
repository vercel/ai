import { Tool } from '@ai-sdk/provider-utils';
import { ValueOf } from '../../src/util/value-of';
import { ToolSet } from './tool-set';
import { ProviderMetadata } from '../types';

// transforms the tools into a tool call union
export type ToolCallUnion<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-call';
    toolCallId: string;
    toolName: NAME & string;
    input: TOOLS[NAME] extends Tool<infer PARAMETERS> ? PARAMETERS : never;
    providerExecuted?: boolean;
    dynamic?: boolean;
    providerMetadata?: ProviderMetadata;
  };
}>;

export type ToolCallArray<TOOLS extends ToolSet> = Array<ToolCallUnion<TOOLS>>;
