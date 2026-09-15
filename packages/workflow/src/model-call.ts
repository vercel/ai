import type {
  JSONObject,
  LanguageModelV4CallOptions,
  LanguageModelV4Source,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import type {
  Experimental_LanguageModelStreamPart,
  FinishReason,
  LanguageModelUsage,
  StopCondition,
  ToolCallRepairFunction,
  ToolChoice,
  ToolSet,
} from 'ai';
import type { ProviderOptions } from './workflow-agent.js';

export type ModelCallStreamPart<TTools extends ToolSet = ToolSet> =
  | Experimental_LanguageModelStreamPart<TTools>
  | {
      type: 'tool-approval-request';
      approvalId: string;
      toolCallId: string;
      signature?: string;
    }
  | { type: 'reset-step' };

export type ModelStopCondition = StopCondition<NoInfer<ToolSet>, any>;

/**
 * Provider-executed tool result captured from a model call.
 */
export interface ProviderExecutedToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
  dynamic?: boolean;
  providerMetadata?: SharedV4ProviderMetadata;
}

/**
 * Serializable options for a durable model call.
 */
export interface ModelCallOptions {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stopSequences?: string[];
  seed?: number;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  timeoutAt?: number;
  headers?: Record<string, string | undefined>;
  reasoning?: LanguageModelV4CallOptions['reasoning'];
  providerOptions?: ProviderOptions;
  toolChoice?: ToolChoice<ToolSet>;
  includeRawChunks?: boolean;
  repairToolCall?: ToolCallRepairFunction<ToolSet>;
  responseFormat?: LanguageModelV4CallOptions['responseFormat'];
}

/**
 * Parsed tool call from the stream (parsed by streamModelCall's transform).
 */
export interface ParsedToolCall {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  input: unknown;
  providerExecuted?: boolean;
  providerMetadata?: SharedV4ProviderMetadata;
  title?: string;
  toolMetadata?: JSONObject;
  dynamic?: boolean;
  invalid?: boolean;
  error?: unknown;
}

/**
 * Finish metadata from a model call.
 */
export interface ModelCallFinish {
  finishReason: FinishReason;
  rawFinishReason: string | undefined;
  usage: LanguageModelUsage;
  providerMetadata?: Record<string, unknown>;
}

export type ModelCallRawContentPart =
  | {
      type: 'text';
      text: string;
      providerMetadata?: SharedV4ProviderMetadata;
    }
  | {
      type: 'file';
      data: string;
      mediaType: string;
      providerMetadata?: SharedV4ProviderMetadata;
    }
  | LanguageModelV4Source
  | {
      type: 'tool-call';
      toolCallIndex: number;
    }
  | {
      type: 'provider-tool-result';
      toolCallId: string;
    };

/**
 * Compact callback replay data. The start event establishes the tool name for
 * a call, so delta events do not repeat it and available events reuse the
 * parsed input already present in `toolCalls`.
 */
export type ToolInputLifecycleEvent =
  | ['start', toolCallId: string, toolName: string]
  | ['delta', toolCallId: string, inputTextDelta: string]
  | ['available', toolCallId: string];

/**
 * Minimal aggregates needed to reconstruct a `StepResult` outside the step
 * boundary. By returning only these fields (instead of a fully-populated
 * StepResult plus the raw `chunks[]` array), the durable event log doesn't
 * carry StepResult's redundant derived fields — duplicate tool-call lists,
 * `text`, `files`, `sources`, `reasoningText`, or the tool-result arrays
 * populated after execution. It also avoids the per-chunk `chunks[]` snapshot
 * the iterator never reads. The caller reconstructs the full StepResult via
 * `buildModelStepResult`.
 */
export interface ModelCallRawResult {
  content: ModelCallRawContentPart[];
  reasoning: Array<{ text: string }>;
  responseMetadata?: { id?: string; timestamp?: Date; modelId?: string };
  warnings?: unknown[];
}

export type ModelCallResult =
  | { aborted: true }
  | {
      aborted?: false;
      toolCalls: ParsedToolCall[];
      finish: ModelCallFinish | undefined;
      raw: ModelCallRawResult;
      providerExecutedToolResults: Map<string, ProviderExecutedToolResult>;
      /**
       * Optional for compatibility with model-step results persisted before
       * tool input lifecycle callback replay was added.
       */
      toolInputLifecycleEvents?: ToolInputLifecycleEvent[];
      /** Present when the model stream emitted an error part. */
      terminalError?: unknown;
    };
