import type { JSONValue } from '@ai-sdk/provider';
import type { FlexibleSchema } from '../schema';
import type { ToolResultOutput } from './content-part';
import type { Context } from './context';
import type { ProviderOptions } from './provider-options';
import type { SensitiveContext } from './sensitive-context';
import type {
  ToolExecuteFunction,
  ToolExecutionOptions,
} from './tool-execute-function';
import type { ToolNeedsApprovalFunction } from './tool-needs-approval-function';

// 0 extends 1 & N checks for any
// [N] extends [never] checks for never
type NeverOptional<N, T> = 0 extends 1 & N
  ? Partial<T>
  : [N] extends [never]
    ? Partial<Record<keyof T, undefined>>
    : T;

/**
 * Helper type to determine the output properties of a tool.
 */
type ToolOutputProperties<
  INPUT,
  OUTPUT,
  CONTEXT extends Context | unknown | never,
> = NeverOptional<
  OUTPUT,
  | {
      /**
       * An async function that is called with the arguments from the tool call and produces a result.
       * If not provided, the tool will not be executed automatically.
       *
       * @args is the input of the tool call.
       * @options.abortSignal is a signal that can be used to abort the tool call.
       */
      execute: ToolExecuteFunction<INPUT, OUTPUT, CONTEXT>;

      /**
       * The schema of the output that the tool produces.
       */
      outputSchema?: FlexibleSchema<OUTPUT>;
    }
  | {
      /**
       * The schema of the output that the tool produces.
       */
      outputSchema: FlexibleSchema<OUTPUT>;

      execute?: never;
    }
>;

/**
 * Common properties shared by all tool kinds.
 */
export type BaseTool<
  INPUT extends JSONValue | unknown | never = any,
  OUTPUT extends JSONValue | unknown | never = any,
  CONTEXT extends Context | unknown | never = any,
> = {
  /**
   * An optional description of what the tool does.
   * Will be used by the language model to decide whether to use the tool.
   * Not used for provider-defined tools.
   */
  description?: string;

  /**
   * An optional title of the tool.
   */
  title?: string;

  /**
   * Additional provider-specific metadata. They are passed through
   * to the provider from the AI SDK and enable provider-specific
   * functionality that can be fully encapsulated in the provider.
   */
  providerOptions?: ProviderOptions;

  /**
   * The schema of the input that the tool expects.
   * The language model will use this to generate the input.
   * It is also used to validate the output of the language model.
   *
   * You can use descriptions on the schema properties to make the input understandable for the language model.
   */
  inputSchema: FlexibleSchema<INPUT>;

  /**
   * An optional list of input examples that show the language
   * model what the input should look like.
   */
  inputExamples?: Array<{ input: NoInfer<INPUT> }>;

  /**
   * An optional schema describing the context that the tool expects.
   *
   * The context is passed to execute function as part of the execution options.
   */
  contextSchema?: FlexibleSchema<CONTEXT>;

  /**
   * Marks top-level context properties that contain sensitive data and should be excluded from telemetry.
   * Properties marked as `true` are omitted from telemetry integrations.
   */
  sensitiveContext?: SensitiveContext<CONTEXT>;

  /**
   * Whether the tool needs approval before it can be executed.
   *
   * @deprecated Tool approval is handled on a `generateText` / `streamText` level now.
   */
  needsApproval?:
    | boolean
    | ToolNeedsApprovalFunction<
        [INPUT] extends [never] ? unknown : INPUT,
        NoInfer<CONTEXT>
      >;

  /**
   * Strict mode setting for the tool.
   *
   * Providers that support strict mode will use this setting to determine
   * how the input should be generated. Strict mode will always produce
   * valid inputs, but it might limit what input schemas are supported.
   */
  strict?: boolean;

  /**
   * Optional function that is called when the argument streaming starts.
   * Only called when the tool is used in a streaming context.
   */
  onInputStart?: (
    options: ToolExecutionOptions<NoInfer<CONTEXT>>,
  ) => void | PromiseLike<void>;

  /**
   * Optional function that is called when an argument streaming delta is available.
   * Only called when the tool is used in a streaming context.
   */
  onInputDelta?: (
    options: { inputTextDelta: string } & ToolExecutionOptions<
      NoInfer<CONTEXT>
    >,
  ) => void | PromiseLike<void>;

  /**
   * Optional function that is called when a tool call can be started,
   * even if the execute function is not provided.
   */
  onInputAvailable?: (
    options: {
      input: [INPUT] extends [never] ? unknown : INPUT;
    } & ToolExecutionOptions<NoInfer<CONTEXT>>,
  ) => void | PromiseLike<void>;

  /**
   * Optional conversion function that maps the tool result to an output that can be used by the language model.
   *
   * If not provided, the tool result will be sent as a JSON object.
   *
   * This function is invoked on the server by `convertToModelMessages`, so ensure that you pass the same "tools" (ToolSet) to both "convertToModelMessages" and "streamText" (or other generation APIs).
   */
  toModelOutput?: (options: {
    /**
     * The ID of the tool call. You can use it e.g. when sending tool-call related information with stream data.
     */
    toolCallId: string;

    /**
     * The input of the tool call.
     */
    input: [INPUT] extends [never] ? unknown : INPUT;

    /**
     * The output of the tool call.
     */
    output: 0 extends 1 & OUTPUT
      ? any
      : [OUTPUT] extends [never]
        ? any
        : NoInfer<OUTPUT>;
  }) => ToolResultOutput | PromiseLike<ToolResultOutput>;
} & ToolOutputProperties<INPUT, OUTPUT, NoInfer<CONTEXT>>;

/**
 * Tool with user-defined input and output schemas.
 */
export type FunctionTool<
  INPUT extends JSONValue | unknown | never = any,
  OUTPUT extends JSONValue | unknown | never = any,
  CONTEXT extends Context | unknown | never = any,
> = BaseTool<INPUT, OUTPUT, CONTEXT> & {
  type?: undefined | 'function';

  // make all properties available to improve usage dx
  id?: never;
  isProviderExecuted?: never;
  args?: never;
  supportsDeferredResults?: never;
};

/**
 * Tool that is defined at runtime (e.g. an MCP tool).
 * The types of input and output are not known at development time.
 */
export type DynamicTool<
  INPUT extends JSONValue | unknown | never = any,
  OUTPUT extends JSONValue | unknown | never = any,
  CONTEXT extends Context | unknown | never = any,
> = BaseTool<INPUT, OUTPUT, CONTEXT> & {
  type: 'dynamic';

  // make all properties available to improve usage dx
  id?: never;
  isProviderExecuted?: never;
  args?: never;
  supportsDeferredResults?: never;
};

/**
 * Tool with provider-defined input and output schemas.
 */
export type ProviderTool<
  INPUT extends JSONValue | unknown | never = any,
  OUTPUT extends JSONValue | unknown | never = any,
  CONTEXT extends Context | unknown | never = any,
> = BaseTool<INPUT, OUTPUT, CONTEXT> & {
  type: 'provider';

  /**
   * The ID of the tool. Must follow the format `<provider-name>.<unique-tool-name>`.
   */
  id: `${string}.${string}`;

  /**
   * Flag that indicates whether the tool is executed by the provider.
   */
  isProviderExecuted: boolean;

  /**
   * The arguments for configuring the tool. Must match the expected arguments defined by the provider for this tool.
   */
  args: Record<string, unknown>;

  /**
   * Whether this provider-executed tool supports deferred results.
   *
   * When true, the tool result may not be returned in the same turn as the
   * tool call (e.g., when using programmatic tool calling where a server tool
   * triggers a client-executed tool, and the server tool's result is deferred
   * until the client tool is resolved).
   *
   * This flag allows the AI SDK to handle tool results that arrive without
   * a matching tool call in the current response.
   *
   * @default false
   */
  supportsDeferredResults?: boolean;
};

/**
 * A tool contains the description and the schema of the input that the tool expects.
 * This enables the language model to generate the input.
 *
 * The tool can also contain an optional execute function for the actual execution function of the tool.
 */
export type Tool<
  INPUT extends JSONValue | unknown | never = any,
  OUTPUT extends JSONValue | unknown | never = any,
  CONTEXT extends Context | unknown | never = any,
> =
  | FunctionTool<INPUT, OUTPUT, CONTEXT>
  | DynamicTool<INPUT, OUTPUT, CONTEXT>
  | ProviderTool<INPUT, OUTPUT, CONTEXT>;

/**
 * Helper function for inferring the execute args of a tool.
 */
// Note: overload order is important for auto-completion
export function tool<INPUT, OUTPUT, CONTEXT extends Context>(
  tool: Tool<INPUT, OUTPUT, CONTEXT>,
): Tool<INPUT, OUTPUT, CONTEXT>;
export function tool<INPUT, CONTEXT extends Context>(
  tool: Tool<INPUT, never, CONTEXT>,
): Tool<INPUT, never, CONTEXT>;
export function tool<OUTPUT, CONTEXT extends Context>(
  tool: Tool<never, OUTPUT, CONTEXT>,
): Tool<never, OUTPUT, CONTEXT>;
export function tool<CONTEXT extends Context>(
  tool: Tool<never, never, CONTEXT>,
): Tool<never, never, CONTEXT>;
export function tool(tool: any): any {
  return tool;
}

/**
 * Defines a dynamic tool.
 */
export function dynamicTool(
  tool: Omit<DynamicTool<unknown, unknown, Context>, 'type'>,
): DynamicTool<unknown, unknown, Context> {
  return { ...tool, type: 'dynamic' } as DynamicTool<unknown, unknown, Context>;
}
