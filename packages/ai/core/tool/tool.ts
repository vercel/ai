import { JSONObject, JSONValue } from '@ai-sdk/provider';
import { Schema } from '@ai-sdk/provider-utils';
import * as z3 from 'zod/v3';
import * as z4 from 'zod/v4/core';
import { ModelMessage } from '../prompt/message';
import { ToolResultContent } from '../prompt/tool-result-content';

export type ToolParameters<T = JSONObject> =
  | z4.$ZodType<T>
  | z3.Schema<T>
  | Schema<T>;

export interface ToolExecutionOptions {
  /**
   * The ID of the tool call. You can use it e.g. when sending tool-call related information with stream data.
   */
  toolCallId: string;

  /**
   * Messages that were sent to the language model to initiate the response that contained the tool call.
   * The messages **do not** include the system prompt nor the assistant response that contained the tool call.
   */
  messages: ModelMessage[];

  /**
   * An optional abort signal that indicates that the overall operation should be aborted.
   */
  abortSignal?: AbortSignal;
}

type NeverOptional<N, T> = 0 extends 1 & N
  ? Partial<T>
  : [N] extends [never]
    ? Partial<Record<keyof T, undefined>>
    : T;

/**
A tool contains the description and the schema of the input that the tool expects.
This enables the language model to generate the input.

The tool can also contain an optional execute function for the actual execution function of the tool.
 */
export type Tool<
  PARAMETERS extends JSONValue | unknown | never = any,
  RESULT = any,
> = {
  /**
An optional description of what the tool does.
Will be used by the language model to decide whether to use the tool.
Not used for provider-defined tools.
   */
  description?: string;
} & NeverOptional<
  PARAMETERS,
  {
    /**
The schema of the input that the tool expects. The language model will use this to generate the input.
It is also used to validate the output of the language model.
Use descriptions to make the input understandable for the language model.
   */
    parameters: ToolParameters<PARAMETERS>;
  }
> &
  NeverOptional<
    RESULT,
    {
      /**
An async function that is called with the arguments from the tool call and produces a result.
If not provided, the tool will not be executed automatically.

@args is the input of the tool call.
@options.abortSignal is a signal that can be used to abort the tool call.
      */
      execute: (
        args: [PARAMETERS] extends [never] ? undefined : PARAMETERS,
        options: ToolExecutionOptions,
      ) => PromiseLike<RESULT>;

      /**
  Optional conversion function that maps the tool result to multi-part tool content for LLMs.
      */
      experimental_toToolResultContent?: (result: RESULT) => ToolResultContent;
    }
  > &
  (
    | {
        /**
Function tool.
     */
        type?: undefined | 'function';
      }
    | {
        /**
Provider-defined tool.
     */
        type: 'provider-defined';

        /**
The ID of the tool. Should follow the format `<provider-name>.<tool-name>`.
     */
        id: `${string}.${string}`;

        /**
The arguments for configuring the tool. Must match the expected arguments defined by the provider for this tool.
     */
        args: Record<string, unknown>;
      }
  );

/**
Helper function for inferring the execute args of a tool.
 */
export function tool(tool: Tool<never, never>): Tool<never, never>;
export function tool<PARAMETERS>(
  tool: Tool<PARAMETERS, never>,
): Tool<PARAMETERS, never>;
export function tool<RESULT>(tool: Tool<never, RESULT>): Tool<never, RESULT>;
export function tool<PARAMETERS, RESULT>(
  tool: Tool<PARAMETERS, RESULT>,
): Tool<PARAMETERS, RESULT>;
export function tool(tool: any): any {
  return tool;
}

export type MappedTool<T extends Tool | JSONObject, RESULT extends any> =
  T extends Tool<infer P>
    ? Tool<P, RESULT>
    : T extends JSONObject
      ? Tool<T, RESULT>
      : never;
