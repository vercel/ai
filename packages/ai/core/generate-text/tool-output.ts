import { ValueOf } from '../../src/util/value-of';
import { Tool } from '@ai-sdk/provider-utils';
import { ToolSet } from './tool-set';

// limits the tools to those that have execute !== undefined
export type ToToolsWithDefinedExecute<TOOLS extends ToolSet> = {
  [K in keyof TOOLS as TOOLS[K]['execute'] extends undefined
    ? never
    : K]: TOOLS[K];
};

// transforms the tools into a tool result union
type ToToolResultObject<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-result';
    toolCallId: string;
    toolName: NAME & string;
    input: TOOLS[NAME] extends Tool<infer P> ? P : never;
    output: Awaited<ReturnType<Exclude<TOOLS[NAME]['execute'], undefined>>>;
  };
}>;

export type ToolResultUnion<TOOLS extends ToolSet> = ToToolResultObject<
  ToToolsWithDefinedExecute<TOOLS>
>;

export type ToolResultArray<TOOLS extends ToolSet> = Array<
  ToolResultUnion<TOOLS>
>;

type ToToolErrorObject<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-error';
    toolCallId: string;
    toolName: NAME & string;
    input: TOOLS[NAME] extends Tool<infer P> ? P : never;
    error: unknown;
  };
}>;

export type ToolErrorUnion<TOOLS extends ToolSet> = ToToolErrorObject<
  ToToolsWithDefinedExecute<TOOLS>
>;

export type ToolOutput<TOOLS extends ToolSet> =
  | ToolResultUnion<TOOLS>
  | ToolErrorUnion<TOOLS>;
