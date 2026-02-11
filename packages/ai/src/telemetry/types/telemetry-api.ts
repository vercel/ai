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

export interface ModelData {
  provider: string;
  id: string;
}

export interface CallSettingsData {
  maxRetries: number;
  maxOutputTokens: number | undefined;
  temperature: number | undefined;
  topP: number | undefined;
  topK: number | undefined;
  frequencyPenalty: number | undefined;
  presencePenalty: number | undefined;
  stopSequences: string[] | undefined;
  seed: number | undefined;
}

export interface ResponseData {
  id?: string;
  model?: string;
  timestamp?: string;
  finishReason: string;
  text?: string;
  reasoning?: string;
  toolCalls?: unknown;
  providerMetadata?: unknown;
}

export interface UsageData {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
}

/** Data emitted when ai.generateText starts. */
export interface GenerateTextStartData {
  model: ModelData;
  settings: CallSettingsData;
  headers: Record<string, string>;
  prompt: { raw: unknown };
}

/** Data emitted when ai.generateText.doGenerate starts. */
export interface DoGenerateStartData {
  model: ModelData;
  settings: CallSettingsData;
  headers: Record<string, string>;
  prompt: {
    messages: unknown;
    tools: unknown[] | undefined;
    toolChoice: unknown | undefined;
  };
}

/** Data emitted when ai.toolCall starts. */
export interface ToolCallStartData {
  toolCall: {
    name: string;
    id: string;
    args: unknown;
  };
}

/** Data emitted when ai.generateText completes (update event). */
export interface GenerateTextResultData {
  response: Omit<ResponseData, 'id' | 'model' | 'timestamp'> & {
    id?: undefined;
    model?: undefined;
    timestamp?: undefined;
  };
  usage: UsageData;
}

/** Data emitted when ai.generateText.doGenerate completes (update event). */
export interface DoGenerateResultData {
  response: ResponseData;
  usage: UsageData;
}

/** Data emitted when ai.toolCall completes (update event). */
export interface ToolCallResultData {
  toolCall: {
    name: string;
    id: string;
    result: unknown;
  };
}

/** Maps operation names to their start event data types. */
export interface StartDataMap {
  'ai.generateText': GenerateTextStartData;
  'ai.generateText.doGenerate': DoGenerateStartData;
  'ai.toolCall': ToolCallStartData;
}

/** Maps operation names to their result (update) event data types. */
export interface ResultDataMap {
  'ai.generateText': GenerateTextResultData;
  'ai.generateText.doGenerate': DoGenerateResultData;
  'ai.toolCall': ToolCallResultData;
}

export type KnownOperationName = keyof StartDataMap;

/**
 * Minimal data for unknown or future operation types.
 * Used as a fallback for extensibility.
 */
export interface CommonStartData {
  model?: ModelData;
  settings?: Partial<CallSettingsData>;
  headers?: Record<string, string>;
  prompt?: {
    raw?: unknown;
    messages?: unknown;
    tools?: unknown[];
    toolChoice?: unknown;
  };
  toolCall?: {
    name: string;
    id: string;
    args?: unknown;
  };
}

/**
 * Minimal result data for unknown or future operation types.
 */
export interface CommonResultData {
  response?: Partial<ResponseData>;
  usage?: Partial<UsageData>;
  toolCall?: {
    name: string;
    id: string;
    result?: unknown;
  };
}

/** Fields injected by the emitter into event data. */
export interface InjectedFields {
  metadata?: Record<string, TelemetryAttributeValue>;
  functionId?: string;
}

/**
 * Generic helper for started events.
 * K is the operation name literal, D is the data type.
 */
export interface BaseStartedEvent<K extends string, D> {
  readonly type: 'operationStarted';
  readonly operationId: string;
  readonly operationName: K;
  readonly parentOperationId: string | undefined;
  readonly startTime: number;
  readonly data: D & InjectedFields;
}

export interface BaseUpdatedEvent<K extends string, D> {
  readonly type: 'operationUpdated';
  readonly operationId: string;
  readonly operationName: K;
  readonly data: D;
}

export interface BaseEndedEvent<K extends string> {
  readonly type: 'operationEnded';
  readonly operationId: string;
  readonly operationName: K;
  readonly endTime: number;
  readonly data: Record<string, never>;
}

/**
 * Discriminated union of all started events.
 * Discriminant is `operationName`.
 */
export type OperationStartedEvent =
  | BaseStartedEvent<'ai.generateText', GenerateTextStartData>
  | BaseStartedEvent<'ai.generateText.doGenerate', DoGenerateStartData>
  | BaseStartedEvent<'ai.toolCall', ToolCallStartData>
  | BaseStartedEvent<string, CommonStartData>; // fallback for future operations

export type OperationUpdatedEvent =
  | BaseUpdatedEvent<'ai.generateText', GenerateTextResultData>
  | BaseUpdatedEvent<'ai.generateText.doGenerate', DoGenerateResultData>
  | BaseUpdatedEvent<'ai.toolCall', ToolCallResultData>
  | BaseUpdatedEvent<string, CommonResultData>; // fallback for future operations

/**
 * Emitted when an operation completes.
 */
export type OperationEndedEvent =
  | BaseEndedEvent<'ai.generateText'>
  | BaseEndedEvent<'ai.generateText.doGenerate'>
  | BaseEndedEvent<'ai.toolCall'>
  | BaseEndedEvent<string>; // fallback for future operations

/**
 * Emitted when an operation encounters an error.
 */
export interface OperationErrorEvent {
  readonly type: 'operationError';
  readonly operationId: string;
  readonly operationName: string;
  readonly error: {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
  };
}

/**
 * union of all telemetry events the SDK can emit.
 */
export type TelemetryEvent =
  | OperationStartedEvent
  | OperationEndedEvent
  | OperationUpdatedEvent
  | OperationErrorEvent;

/**
 * Interface that telemetry backends implement.
 *
 * The AI SDK calls these methods at lifecycle points.
 * Implementations translate the events into their native format
 * (e.g. OTel spans, diagnostics_channel publishes, etc.).
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

/**
 * Telemetry configuration passed to AI SDK functions.
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

  /**
   * Parent operation ID for cross-call grouping.
   *
   * When set, the root operation of each SDK call becomes a child of
   * this operation. Used by `createTrace` to group multiple SDK calls
   * under a single trace.
   *
   * used via `createTrace()`
   */
  parentOperationId?: string;
}
