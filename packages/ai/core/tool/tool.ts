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

/**
 * Options for server-side tool execution.
 */
export interface ServerToolCallOptions extends ToolCallOptions {
  /**
   * Execution context for server-side tools.
   */
  executionContext?: {
    /**
     * Maximum execution time in milliseconds.
     */
    maxExecutionTime?: number;

    /**
     * Whether the tool supports streaming results.
     */
    supportsStreaming?: boolean;

    /**
     * Provider-specific execution metadata.
     */
    providerMetadata?: Record<string, unknown>;
  };
}

/**
 * MCP-inspired tool patterns for server-side tools.
 * These patterns align with Model Context Protocol best practices.
 */
export interface MCPToolPatterns {
  /**
   * Search pattern - returns IDs/references that can be fetched later.
   * Inspired by MCP's search + fetch paradigm.
   */
  search?: {
    /**
     * Query interface for searching.
     */
    querySchema: ToolParameters;
    /**
     * Result schema for search results (typically returns IDs).
     */
    resultSchema: {
      results: Array<{
        id: string;
        title: string;
        snippet?: string;
        score?: number;
        metadata?: Record<string, unknown>;
      }>;
      totalResults?: number;
      hasMore?: boolean;
    };
  };

  /**
   * Fetch pattern - retrieves full content by ID.
   * Complements the search pattern for detailed content retrieval.
   */
  fetch?: {
    /**
     * ID-based fetch interface.
     */
    querySchema: { id: string };
    /**
     * Full content result schema.
     */
    resultSchema: {
      id: string;
      title: string;
      content: string;
      url?: string;
      metadata?: Record<string, unknown>;
    };
  };

  /**
   * Execute pattern - performs actions or computations.
   * For tools that perform operations rather than data retrieval.
   */
  execute?: {
    /**
     * Execution parameters.
     */
    querySchema: ToolParameters;
    /**
     * Execution result schema.
     */
    resultSchema: {
      success: boolean;
      result?: unknown;
      error?: string;
      metadata?: Record<string, unknown>;
    };
  };
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
        options: ToolCallOptions,
      ) => PromiseLike<RESULT>;

      /**
  Optional conversion function that maps the tool result to multi-part tool content for LLMs.
      */
      experimental_toToolResultContent?: (result: RESULT) => ToolResultContent;

      /**
       * Optional function that is called when the argument streaming starts.
       * Only called when the tool is used in a streaming context.
       */
      onArgsStreamingStart?: (
        options: ToolCallOptions,
      ) => void | PromiseLike<void>;

      /**
       * Optional function that is called when an argument streaming delta is available.
       * Only called when the tool is used in a streaming context.
       */
      onArgsStreamingDelta?: (
        options: {
          argsTextDelta: string;
        } & ToolCallOptions,
      ) => void | PromiseLike<void>;

      /**
       * Optional function that is called when a tool call can be started,
       * even if the execute function is not provided.
       */
      onArgsAvailable?: (
        options: {
          args: [PARAMETERS] extends [never] ? undefined : PARAMETERS;
        } & ToolCallOptions,
      ) => void | PromiseLike<void>;

      /**
       * Optional function that is called when a server-side tool call can be started.
       * Only applicable for provider-defined tools with server execution.
       */
      onServerToolCallStart?: (
        options: ServerToolCallOptions,
      ) => void | PromiseLike<void>;

      /**
       * Optional function that is called when server-side tool results are available.
       * Only applicable for provider-defined tools with server execution.
       */
      onServerToolResult?: (
        options: {
          result: RESULT;
          executionTime?: number;
          serverMetadata?: Record<string, unknown>;
        } & ServerToolCallOptions,
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

        /**
Optional execution mode for server-side tools.
'server' means the tool is executed on the provider's servers.
'hybrid' means the tool may be executed server-side or client-side based on provider capabilities.
Defaults to 'server' for provider-defined tools.
         */
        executionMode?: 'server' | 'hybrid';

        /**
Optional result schema for server-side tools to enable type checking of results.
This helps with tool composition and result validation.
         */
        resultSchema?: Record<string, unknown>;

        /**
Optional capabilities that this server-side tool supports.
Used by providers to communicate tool limitations or special features.
         */
        capabilities?: {
          /**
Whether the tool supports streaming results.
           */
          streaming?: boolean;

          /**
Whether the tool supports cancellation during execution.
           */
          cancellable?: boolean;

          /**
Maximum execution time in milliseconds for server-side execution.
           */
          maxExecutionTime?: number;

          /**
Whether the tool requires special permissions or setup.
           */
          requiresSetup?: boolean;

          /**
Provider-specific capability flags.
           */
          providerSpecific?: Record<string, boolean | string | number>;
        };

        /**
Optional server-side tool metadata.
Provides additional information about server execution context.
         */
        serverMetadata?: {
          /**
Whether this tool is always executed server-side.
           */
          alwaysServerSide?: boolean;

          /**
Whether this tool can be executed in parallel with other tools.
           */
          supportsParallelExecution?: boolean;

          /**
Cost information for server-side execution.
           */
          costInfo?: {
            /**
Cost per execution in provider-specific units.
             */
            perExecution?: number;

            /**
Cost per input token processed.
             */
            perInputToken?: number;

            /**
Cost per output generated.
             */
            perOutput?: number;
          };
        };

        /**
MCP-inspired tool patterns for standardized server-side behavior.
Helps tools follow established patterns for search, fetch, and execute operations.
         */
        mcpPatterns?: MCPToolPatterns;

        /**
OAuth configuration for server-side tools that require authentication.
Inspired by OpenAI's MCP authentication approach.
         */
        authentication?: {
          /**
OAuth configuration for this tool.
           */
          oauth?: {
            /**
Authorization URL for OAuth flow.
             */
            authUrl: string;
            /**
Token URL for OAuth flow.
             */
            tokenUrl: string;
            /**
Required OAuth scopes.
             */
            scopes?: string[];
          };
          /**
API key configuration for simpler authentication.
           */
          apiKey?: {
            /**
Name of the API key parameter.
             */
            paramName: string;
            /**
Where to include the API key (header, query, etc).
             */
            location: 'header' | 'query' | 'body';
          };
        };
      }
  );

/**
Helper function for inferring the execute args of a tool.
 */
// Note: overload order is important for auto-completion
export function tool<PARAMETERS, RESULT>(
  tool: Tool<PARAMETERS, RESULT>,
): Tool<PARAMETERS, RESULT>;
export function tool<PARAMETERS>(
  tool: Tool<PARAMETERS, never>,
): Tool<PARAMETERS, never>;
export function tool<RESULT>(tool: Tool<never, RESULT>): Tool<never, RESULT>;
export function tool(tool: Tool<never, never>): Tool<never, never>;
export function tool(tool: any): any {
  return tool;
}

export type MappedTool<T extends Tool | JSONObject, RESULT extends any> =
  T extends Tool<infer P>
    ? Tool<P, RESULT>
    : T extends JSONObject
      ? Tool<T, RESULT>
      : never;
