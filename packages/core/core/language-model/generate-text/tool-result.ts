import { ValueOf } from 'type-fest';
import { z } from 'zod';
import { Tool } from '../tool';

export interface ToolResult<NAME extends string, ARGS, RESULT> {
  toolCallId: string;
  toolName: NAME;
  args: ARGS;
  result: RESULT;
}

// limits the tools to those with an execute value
type ToToolsWithExecute<TOOLS extends Record<string, Tool>> = {
  [K in keyof TOOLS as TOOLS[K] extends { execute: any } ? K : never]: TOOLS[K];
};

// limits the tools to those that have execute !== undefined
type ToToolsWithDefinedExecute<TOOLS extends Record<string, Tool>> = {
  [K in keyof TOOLS as TOOLS[K]['execute'] extends undefined
    ? never
    : K]: TOOLS[K];
};

// transforms the tools into tool calls
export type ToToolResult<TOOLS extends Record<string, Tool>> = ValueOf<{
  [K in keyof TOOLS]: {
    toolCallId: string;
    toolName: K;
    args: z.infer<TOOLS[K]['parameters']>;
    result: Awaited<ReturnType<Exclude<TOOLS[K]['execute'], undefined>>>;
  };
}>;

export type ToToolResultArray<TOOLS extends Record<string, Tool>> = Array<
  ToToolResult<ToToolsWithDefinedExecute<ToToolsWithExecute<TOOLS>>>
>;
