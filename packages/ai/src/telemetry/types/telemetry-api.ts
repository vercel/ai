// ============================================================================
// Telemetry Integration API Types
// ============================================================================

/**
 * Primitive values supported by telemetry attributes.
 *
 * This type is independent of any specific telemetry backend
 * (OpenTelemetry, diagnostics_channel, etc.).
 */
export type TelemetryAttributeValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | boolean[];

/**
 * A bag of telemetry attributes (key-value pairs).
 *
 * Values can be undefined, which means the attribute is not set.
 */
export type TelemetryAttributes = Record<
  string,
  TelemetryAttributeValue | undefined
>;

// ============================================================================
// Telemetry Event Data
// ============================================================================

/**
 * Structured telemetry data carried by telemetry events.
 *
 * All fields are optional — only the relevant ones are populated
 * per operation. The emitter strips input/output fields based on
 * the `recordInputs`/`recordOutputs` settings before passing to handlers.
 *
 * Handlers (OTel, diagnostics_channel, custom) consume this structured
 * data and translate it into their backend-specific format.
 */
export interface TelemetryEventData {
  /** Model information. */
  model?: {
    provider: string;
    id: string;
  };

  /** Call settings. */
  settings?: {
    maxRetries?: number;
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stopSequences?: string[];
    seed?: number;
    timeout?: unknown;
    [key: string]: unknown;
  };

  /** Request headers. */
  headers?: Record<string, string>;

  /**
   * Prompt data.
   * Classified as INPUT — stripped when `recordInputs` is false.
   */
  prompt?: {
    /** The raw user-facing prompt (system/prompt/messages before standardization). */
    raw?: unknown;
    /** Standardized messages sent to the model. */
    messages?: unknown;
    /** Tool definitions sent to the model. */
    tools?: unknown[];
    /** Tool choice configuration. */
    toolChoice?: unknown;
  };

  /**
   * Response data.
   * Classified as OUTPUT — stripped when `recordOutputs` is false.
   */
  response?: {
    id?: string;
    model?: string;
    timestamp?: string;
    finishReason?: string;
    text?: string;
    reasoning?: string;
    toolCalls?: unknown;
    providerMetadata?: unknown;
  };

  /** Token usage. */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };

  /**
   * Tool call data (for `ai.toolCall` operations).
   * `args` is classified as INPUT. `result` is classified as OUTPUT.
   */
  toolCall?: {
    name: string;
    id: string;
    /** Tool call arguments. Classified as INPUT. */
    args?: unknown;
    /** Tool call result. Classified as OUTPUT. */
    result?: unknown;
  };

  /**
   * Embedding data (for `ai.embed` / `ai.embedMany` operations).
   * `value`/`values` are INPUT. `result`/`results` are OUTPUT.
   */
  embedding?: {
    value?: unknown;
    values?: unknown[];
    result?: unknown;
    results?: unknown[];
  };

  /**
   * Ranking data (for `ai.rerank` operations).
   * `documents` is INPUT. `results` is OUTPUT.
   */
  ranking?: {
    type?: string;
    documents?: unknown;
    results?: unknown;
  };

  /** User-provided metadata from TelemetryConfig. Injected by the emitter. */
  metadata?: Record<string, TelemetryAttributeValue>;

  /** Function ID from TelemetryConfig. Injected by the emitter. */
  functionId?: string;

  /**
   * Streaming-specific metrics.
   * Classified as OUTPUT.
   */
  stream?: {
    msToFirstChunk?: number;
    msToFinish?: number;
    avgOutputTokensPerSecond?: number;
  };
}

// ============================================================================
// Telemetry Events
// ============================================================================

/**
 * Emitted when an operation begins.
 */
export interface OperationStartedEvent {
  readonly type: 'operationStarted';

  /** Unique ID for this operation instance. */
  readonly operationId: string;

  /**
   * Operation name, e.g. 'ai.generateText', 'ai.generateText.doGenerate',
   * 'ai.toolCall', 'ai.streamText.doStream'.
   */
  readonly operationName: string;

  /** Parent operation ID — establishes the operation tree. */
  readonly parentOperationId: string | undefined;

  /** Epoch milliseconds when the operation started. */
  readonly startTime: number;

  /** Structured telemetry data for this event. */
  readonly data: TelemetryEventData;
}

/**
 * Emitted when an operation completes successfully.
 */
export interface OperationEndedEvent {
  readonly type: 'operationEnded';

  /** The operation that ended. */
  readonly operationId: string;

  /** Operation name (same as the corresponding start event). */
  readonly operationName: string;

  /** Epoch milliseconds when the operation ended. */
  readonly endTime: number;

  /** Structured telemetry data known after completion. */
  readonly data: TelemetryEventData;
}

/**
 * Emitted when data is added to an in-progress operation.
 *
 * Used for mid-operation updates such as response data after
 * a model call returns, or streaming metrics.
 */
export interface OperationUpdatedEvent {
  readonly type: 'operationUpdated';

  /** The operation being updated. */
  readonly operationId: string;

  /** Operation name (same as the corresponding start event). */
  readonly operationName: string;

  /** Additional structured telemetry data. */
  readonly data: TelemetryEventData;
}

/**
 * Emitted when an operation encounters an error.
 */
export interface OperationErrorEvent {
  readonly type: 'operationError';

  /** The operation that errored. */
  readonly operationId: string;

  /** Operation name (same as the corresponding start event). */
  readonly operationName: string;

  /** Structured error information. */
  readonly error: {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
  };
}

/**
 * Discriminated union of all telemetry events the SDK can emit.
 */
export type TelemetryEvent =
  | OperationStartedEvent
  | OperationEndedEvent
  | OperationUpdatedEvent
  | OperationErrorEvent;

// ============================================================================
// Telemetry Handler
// ============================================================================

/**
 * Interface that telemetry backends implement.
 *
 * The AI SDK calls these methods at lifecycle points.
 * Implementations translate the events into their native format
 * (e.g. OTel spans, diagnostics_channel publishes, etc.).
 *
 * All methods are optional — implement only the events you care about.
 */
export interface TelemetryHandler {
  /** Called when an operation begins. */
  onOperationStarted?(event: OperationStartedEvent): void;

  /** Called when an operation completes successfully. */
  onOperationEnded?(event: OperationEndedEvent): void;

  /** Called when attributes are added to an in-progress operation. */
  onOperationUpdated?(event: OperationUpdatedEvent): void;

  /** Called when an operation encounters an error. */
  onOperationError?(event: OperationErrorEvent): void;

  /** Called on shutdown to flush any pending telemetry data. */
  shutdown?(): Promise<void>;
}

// ============================================================================
// Telemetry Config
// ============================================================================

/**
 * Telemetry configuration passed to AI SDK functions.
 *
 * Contains the handler that receives telemetry events,
 * plus per-call settings that control what data is included.
 *
 * @example Simple usage:
 * ```ts
 * import { otel } from '@ai-sdk/otel';
 *
 * await generateText({
 *   model: openai('gpt-4o'),
 *   prompt: 'Hello',
 *   telemetry: otel(),
 * });
 * ```
 *
 * @example With per-call settings:
 * ```ts
 * await generateText({
 *   model: openai('gpt-4o'),
 *   prompt: 'Hello',
 *   telemetry: {
 *     ...otel(),
 *     functionId: 'my-chat',
 *     metadata: { environment: 'production' },
 *     recordInputs: false,
 *   },
 * });
 * ```
 */
export interface TelemetryConfig {
  /** The handler that receives telemetry events. */
  handler: TelemetryHandler;

  /** Identifier for grouping telemetry by function. */
  functionId?: string;

  /**
   * Custom metadata included as attributes in all events.
   *
   * Each entry becomes an `ai.telemetry.metadata.<key>` attribute.
   */
  metadata?: Record<string, TelemetryAttributeValue>;

  /**
   * Whether to include input data (prompts, tool args) in telemetry.
   *
   * You might want to disable this to avoid recording sensitive information,
   * to reduce data transfers, or to increase performance.
   *
   * @default true
   */
  recordInputs?: boolean;

  /**
   * Whether to include output data (responses, tool results) in telemetry.
   *
   * You might want to disable this to avoid recording sensitive information,
   * to reduce data transfers, or to increase performance.
   *
   * @default true
   */
  recordOutputs?: boolean;
}
