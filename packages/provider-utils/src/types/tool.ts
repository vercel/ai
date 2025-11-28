import { JSONValue, LanguageModelV3ToolResultPart } from '@ai-sdk/provider';
import { FlexibleSchema } from '../schema';
import { ModelMessage } from './model-message';
import { ProviderOptions } from './provider-options';
import { ToolResultOutput } from './content-part';

/**
 * Additional options that are sent into each tool call.
 */
// TODO AI SDK 6: rename to ToolExecutionOptions
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

  /**
   * Additional context.
   *
   * Experimental (can break in patch releases).
   */
  experimental_context?: unknown;
}

/**
 * Function that is called to determine if the tool needs approval before it can be executed.
 */
export type ToolNeedsApprovalFunction<INPUT> = (
  input: INPUT,
  options: {
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
     * Additional context.
     *
     * Experimental (can break in patch releases).
     */
    experimental_context?: unknown;
  },
) => boolean | PromiseLike<boolean>;

export type ToolExecuteFunction<INPUT, OUTPUT> = (
  input: INPUT,
  options: ToolCallOptions,
) => AsyncIterable<OUTPUT> | PromiseLike<OUTPUT> | OUTPUT;

// 0 extends 1 & N checks for any
// [N] extends [never] checks for never
type NeverOptional<N, T> = 0 extends 1 & N
  ? Partial<T>
  : [N] extends [never]
    ? Partial<Record<keyof T, undefined>>
    : T;

type ToolOutputProperties<INPUT, OUTPUT> = NeverOptional<
  OUTPUT,
  | {
      /**
An async function that is called with the arguments from the tool call and produces a result.
If not provided, the tool will not be executed automatically.

@args is the input of the tool call.
@options.abortSignal is a signal that can be used to abort the tool call.
    */
      execute: ToolExecuteFunction<INPUT, OUTPUT>;

      outputSchema?: FlexibleSchema<OUTPUT>;
    }
  | {
      outputSchema: FlexibleSchema<OUTPUT>;

      execute?: never;
    }
>;

/**
A tool contains the description and the schema of the input that the tool expects.
This enables the language model to generate the input.

The tool can also contain an optional execute function for the actual execution function of the tool.
 */
export type Tool<
  INPUT extends JSONValue | unknown | never = any,
  OUTPUT extends JSONValue | unknown | never = any,
> = {
  /**
An optional description of what the tool does.
Will be used by the language model to decide whether to use the tool.
Not used for provider-defined tools.
   */
  description?: string;

  /**
   * An optional title of the tool.
   */
  title?: string;

  /**
Additional provider-specific metadata. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
   */
  providerOptions?: ProviderOptions;

  /**
The schema of the input that the tool expects. The language model will use this to generate the input.
It is also used to validate the output of the language model.
Use descriptions to make the input understandable for the language model.
   */
  inputSchema: FlexibleSchema<INPUT>;

  /**
Whether the tool needs approval before it can be executed.
   */
  needsApproval?:
    | boolean
    | ToolNeedsApprovalFunction<[INPUT] extends [never] ? unknown : INPUT>;
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
      input: [INPUT] extends [never] ? unknown : INPUT;
    } & ToolCallOptions,
  ) => void | PromiseLike<void>;

  /**
   * When true, the tool's full definition is deferred and not loaded into context
   * initially. The tool can be dynamically discovered through a tool search mechanism.
   * This reduces token usage when you have many tools.
   *
   * Requires the Tool Search Tool to be enabled.
   *
   * @experimental This feature is experimental and may change in future versions.
   * Currently only supported by Anthropic Claude models.
   *
   * @see https://www.anthropic.com/engineering/advanced-tool-use
   */
  experimental_deferLoading?: boolean;

  /**
   * Specifies which callers are allowed to invoke this tool.
   * When set to ['code_execution_20250825'], the tool can only be called from
   * within code execution contexts, enabling programmatic tool orchestration.
   *
   * This keeps intermediate results out of Claude's context, reducing token usage
   * and enabling complex multi-step workflows.
   *
   * Requires the Code Execution Tool to be enabled.
   *
   * @experimental This feature is experimental and may change in future versions.
   * Currently only supported by Anthropic Claude models.
   *
   * @see https://www.anthropic.com/engineering/advanced-tool-use
   */
  experimental_allowedCallers?: string[];

  /**
   * Example inputs that demonstrate how to use the tool correctly.
   * These examples help the model understand proper parameter formats,
   * conventions, and usage patterns beyond what JSON Schema can express.
   *
   * Include examples that show:
   * - Minimal parameters (required fields only)
   * - Partial parameters (some optional fields)
   * - Full parameters (all fields populated)
   * - Domain-specific conventions and formats
   *
   * @experimental This feature is experimental and may change in future versions.
   * Currently only supported by Anthropic Claude models.
   *
   * @see https://www.anthropic.com/engineering/advanced-tool-use
   */
  experimental_inputExamples?: unknown[];
} & ToolOutputProperties<INPUT, OUTPUT> & {
    /**
Optional conversion function that maps the tool result to an output that can be used by the language model.

If not provided, the tool result will be sent as a JSON object.
  */
    toModelOutput?: (
      output: 0 extends 1 & OUTPUT
        ? any
        : [OUTPUT] extends [never]
          ? any
          : NoInfer<OUTPUT>,
    ) => ToolResultOutput;
  } & (
    | {
        /**
Tool with user-defined input and output schemas.
     */
        type?: undefined | 'function';
      }
    | {
        /**
Tool that is defined at runtime (e.g. an MCP tool).
The types of input and output are not known at development time.
       */
        type: 'dynamic';
      }
    | {
        /**
Tool with provider-defined input and output schemas.
     */
        type: 'provider-defined';

        /**
The ID of the tool. Should follow the format `<provider-name>.<unique-tool-name>`.
   */
        id: `${string}.${string}`;

        /**
The name of the tool that the user must use in the tool set.
 */
        name: string;

        /**
The arguments for configuring the tool. Must match the expected arguments defined by the provider for this tool.
     */
        args: Record<string, unknown>;
      }
  );

/**
 * Infer the input type of a tool.
 */
export type InferToolInput<TOOL extends Tool> =
  TOOL extends Tool<infer INPUT, any> ? INPUT : never;

/**
 * Infer the output type of a tool.
 */
export type InferToolOutput<TOOL extends Tool> =
  TOOL extends Tool<any, infer OUTPUT> ? OUTPUT : never;

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

/**
 * Defines a dynamic tool.
 */
export function dynamicTool(tool: {
  description?: string;
  title?: string;
  providerOptions?: ProviderOptions;
  inputSchema: FlexibleSchema<unknown>;
  execute: ToolExecuteFunction<unknown, unknown>;
  toModelOutput?: (output: unknown) => ToolResultOutput;

  /**
   * Whether the tool needs approval before it can be executed.
   */
  needsApproval?: boolean | ToolNeedsApprovalFunction<unknown>;
}): Tool<unknown, unknown> & {
  type: 'dynamic';
} {
  return { ...tool, type: 'dynamic' };
}
