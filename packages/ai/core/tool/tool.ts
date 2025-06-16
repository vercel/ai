import { JSONObject, JSONValue } from '@ai-sdk/provider';
import { Schema } from '@ai-sdk/provider-utils';
import * as z3 from 'zod/v3';
import * as z4 from 'zod/v4/core';
import { ModelMessage } from '../prompt/message';
import { ToolResultContent } from '../prompt/tool-result-content';

export type ToolInputSchema<T = JSONObject> =
  | z4.$ZodType<T>
  | z3.Schema<T>
  | Schema<T>;

export interface ToolCallOptions {
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
  INPUT extends JSONValue | unknown | never = any,
  OUTPUT = any,
> = {
  /**
An optional description of what the tool does.
Will be used by the language model to decide whether to use the tool.
Not used for provider-defined-client tools.
   */
  description?: string;
} & NeverOptional<
  INPUT,
  {
    /**
The schema of the input that the tool expects. The language model will use this to generate the input.
It is also used to validate the output of the language model.
Use descriptions to make the input understandable for the language model.
   */
    inputSchema: ToolInputSchema<INPUT>;
  }
> &
  NeverOptional<
    OUTPUT,
    {
      /**
An async function that is called with the arguments from the tool call and produces a result.
If not provided, the tool will not be executed automatically.

@args is the input of the tool call.
@options.abortSignal is a signal that can be used to abort the tool call.
      */
      execute: (
        input: [INPUT] extends [never] ? undefined : INPUT,
        options: ToolCallOptions,
      ) => PromiseLike<OUTPUT>;

      /**
  Optional conversion function that maps the tool result to multi-part tool content for LLMs.
      */
      experimental_toToolResultContent?: (output: OUTPUT) => ToolResultContent;

      /**
       * Optional function that is called when the argument streaming starts.
       * Only called when the tool is used in a streaming context.
       */
      onInputStart?: (options: ToolCallOptions) => void | PromiseLike<void>;

      /**
       * Optional function that is called when an argument streaming delta is available.
       * Only called when the tool is used in a streaming context.
       */
      onInputDelta?: (
        options: { inputTextDelta: string } & ToolCallOptions,
      ) => void | PromiseLike<void>;

      /**
       * Optional function that is called when a tool call can be started,
       * even if the execute function is not provided.
       */
      onInputAvailable?: (
        options: {
          input: [INPUT] extends [never] ? undefined : INPUT;
        } & ToolCallOptions,
      ) => void | PromiseLike<void>;
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
Provider-defined-client tool.
     */
        type: 'provider-defined-client';

        /**
The ID of the tool. Should follow the format `<provider-name>.<tool-name>`.
     */
        id: `${string}.${string}`;

        /**
The arguments for configuring the tool. Must match the expected arguments defined by the provider for this tool.
     */
        args: Record<string, unknown>;
      }
    | {
        /**
Provider-defined-server tool.
     */
        type: 'provider-defined-server';

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
// Note: overload order is important for auto-completion
export function tool<INPUT, OUTPUT>(
  tool: Tool<INPUT, OUTPUT>,
): Tool<INPUT, OUTPUT>;
export function tool<INPUT>(tool: Tool<INPUT, never>): Tool<INPUT, never>;
export function tool<OUTPUT>(tool: Tool<never, OUTPUT>): Tool<never, OUTPUT>;
export function tool(tool: Tool<never, never>): Tool<never, never>;
export function tool(tool: any): any {
  return tool;
}

export type MappedTool<T extends Tool | JSONObject, OUTPUT extends any> =
  T extends Tool<infer INPUT>
    ? Tool<INPUT, OUTPUT>
    : T extends JSONObject
      ? Tool<T, OUTPUT>
      : never;
