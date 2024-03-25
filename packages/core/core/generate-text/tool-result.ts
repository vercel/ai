import { z } from 'zod';
import { ExperimentalTool } from '../tool';
import { ValueOf } from '../util/value-of';

export interface ToolResult<NAME extends string, ARGS, RESULT> {
  toolCallId: string;
  toolName: NAME;
  args: ARGS;
  result: RESULT;
}

// limits the tools to those with an execute value
type ToToolsWithExecute<TOOLS extends Record<string, ExperimentalTool>> = {
  [K in keyof TOOLS as TOOLS[K] extends { execute: any } ? K : never]: TOOLS[K];
};

// limits the tools to those that have execute !== undefined
type ToToolsWithDefinedExecute<TOOLS extends Record<string, ExperimentalTool>> =
  {
    [K in keyof TOOLS as TOOLS[K]['execute'] extends undefined
      ? never
      : K]: TOOLS[K];
  };

// transforms the tools into a tool result union
type ToToolResultObject<TOOLS extends Record<string, ExperimentalTool>> =
  ValueOf<{
    [NAME in keyof TOOLS]: {
      toolCallId: string;
      toolName: NAME & string;
      args: z.infer<TOOLS[NAME]['parameters']>;
      result: Awaited<ReturnType<Exclude<TOOLS[NAME]['execute'], undefined>>>;
    };
  }>;

export type ToToolResult<TOOLS extends Record<string, ExperimentalTool>> =
  ToToolResultObject<ToToolsWithDefinedExecute<ToToolsWithExecute<TOOLS>>>;

export type ToToolResultArray<TOOLS extends Record<string, ExperimentalTool>> =
  Array<ToToolResult<TOOLS>>;
