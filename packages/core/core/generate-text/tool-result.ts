import { z } from 'zod';
import { ExperimentalTool } from '../tool';
import { ValueOf } from '../util/value-of';

/**
Typed tool result that is returned by generateText and streamText. 
It contains the tool call ID, the tool name, the tool arguments, and the tool result.
 */
export interface ToolResult<NAME extends string, ARGS, RESULT> {
  /**
ID of the tool call. This ID is used to match the tool call with the tool result.
 */
  toolCallId: string;

  /**
Name of the tool that was called.
 */
  toolName: NAME;

  /**
Arguments of the tool call. This is a JSON-serializable object that matches the tool's input schema.
   */
  args: ARGS;

  /**
Result of the tool call. This is the result of the tool's execution.
   */
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
      type: 'tool-result';
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
