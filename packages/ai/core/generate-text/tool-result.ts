import { inferParameters } from '../tool/tool';
import { ValueOf } from '../util/value-of';
import { ToolSet } from './tool-set';

export type { CoreToolResult, ToolResult } from '@ai-sdk/provider-utils';

// limits the tools to those with an execute value
type ToToolsWithExecute<TOOLS extends ToolSet> = {
  [K in keyof TOOLS as TOOLS[K] extends { execute: any } ? K : never]: TOOLS[K];
};

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
    args: inferParameters<TOOLS[NAME]['parameters']>;
    result: Awaited<ReturnType<Exclude<TOOLS[NAME]['execute'], undefined>>>;
  };
}>;

export type ToolResultUnion<TOOLS extends ToolSet> = ToToolResultObject<
  ToToolsWithDefinedExecute<ToToolsWithExecute<TOOLS>>
>;

/**
 * @deprecated Use `ToolResultUnion` instead.
 */
// TODO remove in v5
export type CoreToolResultUnion<TOOLS extends ToolSet> = ToolResultUnion<TOOLS>;

export type ToolResultArray<TOOLS extends ToolSet> = Array<
  ToolResultUnion<TOOLS>
>;
