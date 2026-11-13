import type { SerializableTelemetryBody } from './serializable-telemetry-body.js';
import type {
  JSONObject,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4Source,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import type { Context } from '@ai-sdk/provider-utils';
import type {
  DurableTelemetryContext,
  LanguageModelStreamPart,
  FinishReason,
  LanguageModelUsage,
  StepResultPerformance,
  StopCondition,
  TelemetryOptions,
  ToolCallRepairFunction,
  ToolChoice,
  ToolSet,
} from 'ai';
import type { DownloadFunction, ProviderOptions } from './workflow-agent.js';

export type ModelCallStreamPart<TTools extends ToolSet = ToolSet> =
  | LanguageModelStreamPart<TTools>
  | {
      type: 'tool-approval-request';
      approvalId: string;
      toolCallId: string;
      signature?: string;
      /** Raw input before the original tool schema transformed it. */
      inputSchemaInput?: unknown;
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
  /** Time limit for this model call, including SDK retries. */
  stepTimeoutMs?: number;
  /** Stream mode: time limit for the first output chunk of this model call. */
  firstChunkTimeoutMs?: number;
  /** Stream mode: time limit between two output chunks of this model call. */
  chunkTimeoutMs?: number;
  headers?: Record<string, string | undefined>;
  reasoning?: LanguageModelV4CallOptions['reasoning'];
  providerOptions?: ProviderOptions;
  toolChoice?: ToolChoice<ToolSet>;
  includeRawChunks?: boolean;
  repairToolCall?: ToolCallRepairFunction<ToolSet>;
  download?: DownloadFunction;
  include?: {
    requestBody?: boolean;
    responseBody?: boolean;
    requestMessages?: boolean;
  };
  responseFormat?: LanguageModelV4CallOptions['responseFormat'];
  /**
   * Set when globally registered integrations are not available in the
   * workflow body. The model step then runs the provider call in the
   * integrations' context and returns its timing, so the workflow can report
   * the call when the run ends.
   */
  telemetry?: ModelCallTelemetry;
}

/**
 * Serializable telemetry settings for a durable model call.
 */
export interface ModelCallTelemetry {
  /**
   * Telemetry call ID of the durable run, shared with the events reported
   * when the run ends.
   */
  callId?: string;
  contexts?: Array<DurableTelemetryContext | undefined>;
  functionId?: string;
  recordInputs?: boolean;
  recordOutputs?: boolean;
  stepNumber: number;
  includeRuntimeContext?: TelemetryOptions['includeRuntimeContext'];
  /** Runtime context filtered before crossing the durable step boundary. */
  runtimeContext?: Context;
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
  /** Raw input before the original tool schema validated and transformed it. */
  inputSchemaInput?: unknown;
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

export type ModelCallPerformance = Omit<
  StepResultPerformance,
  'stepTimeMs' | 'toolExecutionMs'
>;

export type ModelCallRawContentPart =
  | Extract<
      LanguageModelV4Content,
      {
        type:
          | 'reasoning'
          | 'custom'
          | 'reasoning-file'
          | 'tool-approval-request';
      }
    >
  | {
      type: 'text';
      text: string;
      providerMetadata?: SharedV4ProviderMetadata;
    }
  | {
      type: 'reasoning';
      reasoningIndex: number;
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
  reasoning: Array<{
    text: string;
    providerMetadata?: SharedV4ProviderMetadata;
  }>;
  /** Provider-owned views of included bodies, retained across the step return. */
  telemetryBodies?: {
    request?: SerializableTelemetryBody;
    response?: SerializableTelemetryBody;
  };
  responseMetadata?: {
    id?: string;
    timestamp?: Date;
    modelId?: string;
    headers?: Record<string, string>;
    body?: unknown;
  };
  /** Present only on non-streaming results; old stream payloads remain valid. */
  generation?: {
    provider: string;
    modelId: string;
    request?: { body?: unknown };
    responseTimeMs: number;
  };
  /** Present on streamed results produced after performance tracking was added. */
  performance?: ModelCallPerformance;
  warnings?: unknown[];
}

/**
 * Wall-clock time of the provider call inside a durable model step, in
 * milliseconds since the Unix epoch. Used to report model-call telemetry with
 * the time it happened.
 */
export interface ModelCallTiming {
  startedAt: number;
  endedAt: number;
}

export type ModelCallResult =
  | { aborted: true; timing?: ModelCallTiming }
  | {
      aborted?: false;
      timing?: ModelCallTiming;
      toolCalls: ParsedToolCall[];
      finish: ModelCallFinish | undefined;
      raw: ModelCallRawResult;
      providerExecutedToolResults: Map<string, ProviderExecutedToolResult>;
      /**
       * Optional for compatibility with model-step results persisted before
       * tool input lifecycle callback replay was added.
       */
      toolInputLifecycleEvents?: ToolInputLifecycleEvent[];
      /**
       * Tool call ids that `repairToolCall` already repaired inside the step,
       * so deferred validation does not repair them a second time.
       */
      repairedToolCallIds?: string[];
      /** Present when the model stream emitted an error part or generation failed. */
      terminalError?: unknown;
    };
