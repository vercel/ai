import type { ToolSet } from '@ai-sdk/provider-utils';
import type {
  EmbedEndEvent,
  EmbedStartEvent,
  EmbeddingModelCallEndEvent,
  EmbeddingModelCallStartEvent,
} from '../embed/embed-events';
import type {
  GenerateObjectEndEvent,
  GenerateObjectStartEvent,
  GenerateObjectStepEndEvent,
  GenerateObjectStepStartEvent,
} from '../generate-object/structured-output-events';
import type {
  StreamTextChunkEvent,
  GenerateTextEndEvent,
  GenerateTextStartEvent,
  GenerateTextStepEndEvent,
  GenerateTextStepStartEvent,
} from '../generate-text/core-events';
import type {
  LanguageModelCallEndEvent,
  LanguageModelCallStartEvent,
  OnLanguageModelCallEndCallback,
  OnLanguageModelCallStartCallback,
} from '../generate-text/language-model-events';
import type {
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
} from '../generate-text/tool-execution-events';
import type {
  RerankEndEvent,
  RerankStartEvent,
  RerankingModelCallEndEvent,
  RerankingModelCallStartEvent,
} from '../rerank/rerank-events';
import type { Callback } from '../util/callback';
import { TelemetryOptions } from '../telemetry/telemetry-options';

export type InferTelemetryEvent<EVENT> = EVENT &
  Omit<TelemetryOptions, 'integrations' | 'isEnabled'>;

type OperationStartEvent =
  | GenerateTextStartEvent
  | GenerateObjectStartEvent
  | EmbedStartEvent
  | RerankStartEvent;

type OperationFinishEvent =
  | GenerateTextEndEvent<ToolSet>
  | GenerateObjectEndEvent<unknown>
  | EmbedEndEvent
  | RerankEndEvent;

export interface TelemetryDispatcher {
  onStart?: Callback<OperationStartEvent>;
  onStepStart?: Callback<GenerateTextStepStartEvent>;
  onLanguageModelCallStart?: OnLanguageModelCallStartCallback;
  onLanguageModelCallEnd?: OnLanguageModelCallEndCallback;
  onToolExecutionStart?: Callback<ToolExecutionStartEvent>;
  onToolExecutionEnd?: Callback<ToolExecutionEndEvent>;
  onChunk?: Callback<StreamTextChunkEvent>;
  onStepFinish?: Callback<GenerateTextStepEndEvent>;
  onObjectStepStart?: Callback<GenerateObjectStepStartEvent>;
  onObjectStepFinish?: Callback<GenerateObjectStepEndEvent>;
  onEmbedStart?: Callback<EmbeddingModelCallStartEvent>;
  onEmbedFinish?: Callback<EmbeddingModelCallEndEvent>;
  onRerankStart?: Callback<RerankingModelCallStartEvent>;
  onRerankFinish?: Callback<RerankingModelCallEndEvent>;
  onFinish?: Callback<OperationFinishEvent>;
  onError?: Callback<unknown>;
  executeTool?: Telemetry['executeTool'];
}

/**
 * Implement this interface to create custom telemetry integrations.
 * Methods can be sync or return a PromiseLike.
 */
export interface Telemetry {
  /**
   * Called when an operation begins. Fired for text generation
   * (generateText/streamText), object generation (generateObject/streamObject),
   * embedding (embed/embedMany), and reranking operations.
   *
   * Use the `operationId` field to distinguish between operation types.
   */
  onStart?: Callback<InferTelemetryEvent<OperationStartEvent>>;

  /**
   * Called when an individual step (single LLM invocation) begins.
   * A generation may consist of multiple steps (e.g. when tool calls trigger
   * follow-up LLM calls). Use this to create per-step spans or record
   * step-level inputs.
   *
   * The event includes the step number, accumulated previous step results,
   * and the messages that will be sent to the model.
   */
  onStepStart?: Callback<InferTelemetryEvent<GenerateTextStepStartEvent>>;

  /**
   * Called immediately before the provider model call begins.
   * Unlike `onStepStart`, this callback is scoped to model work only and
   * excludes any later client-side tool execution.
   */
  onLanguageModelCallStart?: Callback<
    InferTelemetryEvent<LanguageModelCallStartEvent>
  >;

  /**
   * Called after the model response has been normalized and parsed, but before
   * any client-side tool execution begins.
   */
  onLanguageModelCallEnd?: Callback<
    InferTelemetryEvent<LanguageModelCallEndEvent>
  >;

  /**
   * Called when a tool execution begins, before the tool's `execute` function
   * is invoked. Use this to create tool-level spans or log tool invocations.
   */
  onToolExecutionStart?: Callback<InferTelemetryEvent<ToolExecutionStartEvent>>;

  /**
   * Called when a tool execution completes, either successfully or with an error.
   * The event uses a discriminated union on the `success` field — check
   * `event.success` to determine whether `output` or `error` is available.
   *
   * The event includes execution duration (`durationMs`) for performance tracking.
   */
  onToolExecutionEnd?: Callback<InferTelemetryEvent<ToolExecutionEndEvent>>;

  /**
   * Called for each chunk received during streaming.
   * Only relevant for `streamText` — not called during `generateText`.
   */
  onChunk?: Callback<StreamTextChunkEvent>;

  /**
   * Called when an individual step (single LLM invocation) completes.
   * The event is a `StepResult` containing the model's response, tool calls
   * and results, usage statistics, finish reason, and optional request/response
   * bodies.
   */
  onStepFinish?: Callback<InferTelemetryEvent<GenerateTextStepEndEvent>>;

  /**
   * Called when an object generation step (single LLM invocation) begins.
   * For generateObject/streamObject there is always exactly one step.
   *
   * @deprecated
   */
  onObjectStepStart?: Callback<
    InferTelemetryEvent<GenerateObjectStepStartEvent>
  >;

  /**
   * Called when an object generation step (single LLM invocation) completes,
   * with the raw result before JSON parsing and schema validation.
   *
   * @deprecated
   */
  onObjectStepFinish?: Callback<
    InferTelemetryEvent<GenerateObjectStepEndEvent>
  >;

  /**
   * Called when an individual embedding model call (doEmbed) begins.
   * For `embed`, there is one call. For `embedMany`, there may be multiple
   * calls when values are chunked.
   */
  onEmbedStart?: Callback<InferTelemetryEvent<EmbeddingModelCallStartEvent>>;

  /**
   * Called when an individual embedding model call (doEmbed) completes.
   * Contains the embeddings, usage, and any warnings from the model response.
   */
  onEmbedFinish?: Callback<InferTelemetryEvent<EmbeddingModelCallEndEvent>>;

  /**
   * Called when an individual reranking model call (doRerank) begins.
   * There is one call per `rerank` invocation.
   */
  onRerankStart?: Callback<InferTelemetryEvent<RerankingModelCallStartEvent>>;

  /**
   * Called when an individual reranking model call (doRerank) completes.
   * Contains the ranking results from the model response.
   */
  onRerankFinish?: Callback<InferTelemetryEvent<RerankingModelCallEndEvent>>;

  /**
   * Called when an operation completes. Fired for text generation
   * (generateText/streamText), object generation (generateObject/streamObject),
   * embedding (embed/embedMany), and reranking operations.
   *
   * Use the event shape or `operationId` to distinguish between operation types.
   */
  onFinish?: Callback<InferTelemetryEvent<OperationFinishEvent>>;

  /**
   * Called when an unrecoverable error occurs during the generation lifecycle.
   * The error value is untyped — it may be an `Error` instance, an `AISDKError`,
   * or any thrown value.
   *
   * Use this to record error details on telemetry spans and set error status.
   */
  onError?: Callback<unknown>;

  /**
   * Optionally runs the tool execute function in a telemetry-integration-specific context. This enables
   * nested traces — e.g. when a tool's `execute` function calls `generateText`,
   * the inner call's spans become children of the tool span.
   *
   * @param options.callId - The call ID of the tool call.
   * @param options.toolCallId - The tool call ID.
   * @param options.execute - The function to execute.
   */
  executeTool?: <T>(options: {
    callId: string;
    toolCallId: string;
    execute: () => PromiseLike<T>;
  }) => PromiseLike<T>;
}
