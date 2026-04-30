import type { JSONValue, SharedV4ProviderMetadata } from '@ai-sdk/provider';
import type { FlexibleSchema } from '../schema';
import type { ToolResultOutput } from './content-part';
import type { Context } from './context';
import type { NeverOptional } from './never-optional';
import type { ProviderOptions } from './provider-options';
import type { SensitiveContext } from './sensitive-context';
import type {
  ToolExecuteFunction,
  ToolExecutionOptions,
} from './tool-execute-function';
import type { ToolNeedsApprovalFunction } from './tool-needs-approval-function';

/**
 * Helper type to determine the outputSchema and execute function properties of a tool.
 */
type ToolOutputProperties<
  INPUT,
  OUTPUT,
  CONTEXT extends Context | unknown | never,
> = NeverOptional<
  OUTPUT,
  | {
      /**
       * The optional schema of the output that the tool produces.
       *
       * If not provided, the output shape will be inferred from the execute function.
       */
      outputSchema?: FlexibleSchema<OUTPUT>;

      /**
       * An async function that is called with the arguments from the tool call and produces a result.
       * If not provided, the tool will not be executed automatically.
       *
       * @args is the input of the tool call.
       * @options.abortSignal is a signal that can be used to abort the tool call.
       */
      execute: ToolExecuteFunction<INPUT, OUTPUT, CONTEXT>;
    }
  | {
      /**
       * The schema of the output that the tool produces.
       *
       * Required when no execute function is provided.
       */
      outputSchema: FlexibleSchema<OUTPUT>;

      execute?: never;
    }
>;

/**
 * Common properties shared by all tool kinds.
 */
type BaseTool<
  INPUT extends JSONValue | unknown | never = any,
  OUTPUT extends JSONValue | unknown | never = any,
  CONTEXT extends Context | unknown | never = any,
> = {
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
   * Optional metadata about the tool itself (e.g. its source).
   *
   * Unlike `providerOptions`, this metadata is not sent to the language
   * model. Instead, it is propagated onto the resulting tool call's
   * `providerMetadata` so consumers can read it from tool call / result
   * parts and UI message parts. This is useful for sources of dynamic
   * tools (e.g. an MCP server) to identify themselves.
   */
  providerMetadata?: SharedV4ProviderMetadata;

  /**
   * The schema of the input that the tool expects.
   * The language model will use this to generate the input.
   * It is also used to validate the output of the language model.
   *
   * You can use descriptions on the schema properties to make the input understandable for the language model.
   */
  inputSchema: FlexibleSchema<INPUT>;

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
 * Common properties shared by function-style tools.
 */
type BaseFunctionTool<
  INPUT extends JSONValue | unknown | never = any,
  OUTPUT extends JSONValue | unknown | never = any,
  CONTEXT extends Context | unknown | never = any,
> = BaseTool<INPUT, OUTPUT, CONTEXT> & {
  /**
   * An optional description of what the tool does.
   * Will be used by the language model to decide whether to use the tool.
   */
  description?: string;

  /**
   * Strict mode setting for the tool.
   *
   * Providers that support strict mode will use this setting to determine
   * how the input should be generated. Strict mode will always produce
   * valid inputs, but it might limit what input schemas are supported.
   */
  strict?: boolean;

  /**
   * An optional list of input examples that show the language
   * model what the input should look like.
   */
  inputExamples?: Array<{ input: NoInfer<INPUT> }>;

  // make all properties available to improve usage dx
  id?: never;
  isProviderExecuted?: never;
  args?: never;
  supportsDeferredResults?: never;
};

/**
 * Tool with user-defined input and output schemas.
 */
export type FunctionTool<
  INPUT extends JSONValue | unknown | never = any,
  OUTPUT extends JSONValue | unknown | never = any,
  CONTEXT extends Context | unknown | never = any,
> = BaseFunctionTool<INPUT, OUTPUT, CONTEXT> & {
  type?: undefined | 'function';
};

/**
 * Tool that is defined at runtime (e.g. an MCP tool).
 * The types of input and output are not known at development time.
 */
export type DynamicTool<
  INPUT extends JSONValue | unknown | never = any,
  OUTPUT extends JSONValue | unknown | never = any,
  CONTEXT extends Context | unknown | never = any,
> = BaseFunctionTool<INPUT, OUTPUT, CONTEXT> & {
  type: 'dynamic';
};

/**
 * Common properties shared by provider tools.
 */
type BaseProviderTool<
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
   * The arguments for configuring the tool. Must match the expected arguments defined by the provider for this tool.
   */
  args: Record<string, unknown>;

  // make all properties available to improve usage dx
  description?: never;
  strict?: never;
  inputExamples?: never;
};

/**
 * Tool with provider-defined input and output schemas that is executed by the
 * user.
 */
export type ProviderDefinedTool<
  INPUT extends JSONValue | unknown | never = any,
  OUTPUT extends JSONValue | unknown | never = any,
  CONTEXT extends Context | unknown | never = any,
> = BaseProviderTool<INPUT, OUTPUT, CONTEXT> & {
  /**
   * Flag that indicates whether the tool is executed by the provider.
   */
  isProviderExecuted: false;

  // make all properties available to improve usage dx
  supportsDeferredResults?: never;
};

/**
 * Tool with provider-defined input and output schemas that is executed by the
 * provider.
 */
export type ProviderExecutedTool<
  INPUT extends JSONValue | unknown | never = any,
  OUTPUT extends JSONValue | unknown | never = any,
  CONTEXT extends Context | unknown | never = any,
> = BaseProviderTool<INPUT, OUTPUT, CONTEXT> & {
  /**
   * Flag that indicates whether the tool is executed by the provider.
   */
  isProviderExecuted: true;

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
 * A tool can either be user-defined or provider-defined.
 *
 * It contains the schemas and metadata needed for the language model to call
 * the tool and can include an execute function for tools that are executed by
 * the AI SDK.
 */
export type Tool<
  INPUT extends JSONValue | unknown | never = any,
  OUTPUT extends JSONValue | unknown | never = any,
  CONTEXT extends Context | unknown | never = any,
> =
  | FunctionTool<INPUT, OUTPUT, CONTEXT>
  | DynamicTool<INPUT, OUTPUT, CONTEXT>
  | ProviderDefinedTool<INPUT, OUTPUT, CONTEXT>
  | ProviderExecutedTool<INPUT, OUTPUT, CONTEXT>;

/**
 * Infer the tool type from a tool object.
 *
 * This is useful for type inference when working with tool objects.
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
 * Define a dynamic tool.
 */
export function dynamicTool(
  tool: Omit<DynamicTool<unknown, unknown, Context>, 'type'>,
): DynamicTool<unknown, unknown, Context> {
  return { ...tool, type: 'dynamic' } as DynamicTool<unknown, unknown, Context>;
}
