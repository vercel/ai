import type {
  TelemetryConfig,
  TelemetryHandler,
  TelemetryAttributeValue,
  StartDataMap,
  ResultDataMap,
  InjectedFields,
} from './types';
import { noopHandler } from './handlers/noop-handler';
import { getActiveTrace } from './create-trace';

/**
 * Internal type representing the shape of data that can be policy-processed.
 * Used internally for type-safe data stripping.
 */
type ProcessableData = {
  prompt?: {
    raw?: unknown;
    messages?: unknown;
    tools?: unknown[];
    toolChoice?: unknown;
  };
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
  toolCall?: {
    name: string;
    id: string;
    args?: unknown;
    result?: unknown;
  };
};

/**
 * Internal class used by AI SDK core functions to emit telemetry events.
 *
 * Handles:
 * - Resolving the handler from TelemetryConfig (or noop if undefined)
 * - Stripping input/output fields based on recordInputs/recordOutputs
 * - Injecting functionId and metadata into event data
 *
 * Core functions create an instance and call its methods at lifecycle points,
 * passing strongly-typed data objects that match the operation name.
 */
export class TelemetryEmitter {
  private readonly handler: TelemetryHandler;
  private readonly recordInputs: boolean;
  private readonly recordOutputs: boolean;
  private readonly functionId: string | undefined;
  private readonly metadata:
    | Record<string, TelemetryAttributeValue>
    | undefined;
  private readonly parentOperationId: string | undefined;

  /** Whether telemetry is active (a config was provided). */
  readonly isActive: boolean;

  constructor(config: TelemetryConfig | undefined) {
    // If no explicit config, check for an ambient trace via AsyncLocalStorage
    if (config == null) {
      config = getActiveTrace();
    }

    if (config == null) {
      this.handler = noopHandler;
      this.recordInputs = true;
      this.recordOutputs = true;
      this.functionId = undefined;
      this.metadata = undefined;
      this.parentOperationId = undefined;
      this.isActive = false;
      return;
    }

    this.handler = config.handler;
    this.recordInputs = config.recordInputs !== false;
    this.recordOutputs = config.recordOutputs !== false;
    this.functionId = config.functionId;
    this.metadata = config.metadata;
    this.parentOperationId = config.parentOperationId;
    this.isActive = true;
  }

  /**
   * Emit an operation-started event.
   *
   * Parent resolution order:
   * 1. Explicit `parentOperationId` (intra-call parent, e.g. root → step)
   * 2. Config-level `parentOperationId` (from trace, for cross-call grouping)
   * 3. `undefined` (root of trace)
   */
  startOperation<K extends keyof StartDataMap>({
    operationId,
    operationName,
    parentOperationId,
    data,
  }: {
    operationId: string;
    operationName: K;
    parentOperationId?: string;
    data: StartDataMap[K];
  }): void {
    if (!this.isActive) return;

    const processed = this.processStartData(data);

    this.handler.onOperationStarted?.({
      type: 'operationStarted',
      operationId,
      operationName,
      parentOperationId: parentOperationId ?? this.parentOperationId,
      startTime: Date.now(),
      data: processed,
    } as Parameters<NonNullable<TelemetryHandler['onOperationStarted']>>[0]);
  }

  /**
   * Emit an operation-ended event.
   */
  endOperation<K extends keyof StartDataMap>({
    operationId,
    operationName,
  }: {
    operationId: string;
    operationName: K;
  }): void {
    if (!this.isActive) return;

    this.handler.onOperationEnded?.({
      type: 'operationEnded',
      operationId,
      operationName,
      endTime: Date.now(),
      data: {} as Record<string, never>,
    } as Parameters<NonNullable<TelemetryHandler['onOperationEnded']>>[0]);
  }

  /**
   * Emit an operation-updated event (mid-operation data addition).
   */
  updateOperation<K extends keyof ResultDataMap>({
    operationId,
    operationName,
    data,
  }: {
    operationId: string;
    operationName: K;
    data: ResultDataMap[K];
  }): void {
    if (!this.isActive) return;

    const processed = this.processResultData(data);

    this.handler.onOperationUpdated?.({
      type: 'operationUpdated',
      operationId,
      operationName,
      data: processed,
    } as Parameters<NonNullable<TelemetryHandler['onOperationUpdated']>>[0]);
  }

  /**
   * Emit an operation-error event.
   */
  errorOperation({
    operationId,
    operationName,
    error,
  }: {
    operationId: string;
    operationName: string;
    error: unknown;
  }): void {
    if (!this.isActive) return;

    const errorInfo =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : {
            name: 'UnknownError',
            message: String(error),
          };

    this.handler.onOperationError?.({
      type: 'operationError',
      operationId,
      operationName,
      error: errorInfo,
    });
  }

  /**
   * Process start event data: apply policy stripping and inject common fields.
   */
  private processStartData<D extends ProcessableData>(
    data: D,
  ): D & InjectedFields {
    let result = this.applyDataPolicy(data);
    result = this.injectCommonFields(result);
    return result;
  }

  /**
   * Process result event data: apply policy stripping only.
   */
  private processResultData<D extends ProcessableData>(data: D): D {
    return this.applyDataPolicy(data);
  }

  /**
   * Strip input/output classified fields based on recordInputs/recordOutputs.
   */
  private applyDataPolicy<D extends ProcessableData>(data: D): D {
    const result = { ...data } as ProcessableData;

    // Strip input content
    if (!this.recordInputs) {
      if (result.prompt) {
        result.prompt = {
          // we still preserve the messages marker
          messages: result.prompt.messages != null ? [] : undefined,
          raw: undefined,
          tools: undefined,
          toolChoice: undefined,
        };
      }

      if (result.toolCall) {
        result.toolCall = { ...result.toolCall, args: undefined };
      }
    }

    // Strip output content fields (keep response metadata like finishReason, id, model, timestamp)
    if (!this.recordOutputs) {
      if (result.response) {
        result.response = {
          id: result.response.id,
          model: result.response.model,
          timestamp: result.response.timestamp,
          finishReason: result.response.finishReason,
          // Strip actual output content:
          text: undefined,
          reasoning: undefined,
          toolCalls: undefined,
          providerMetadata: undefined,
        };
      }

      if (result.toolCall) {
        result.toolCall = { ...result.toolCall, result: undefined };
      }
    }

    return result as D;
  }

  /**
   * Inject functionId and metadata from the TelemetryConfig.
   */
  private injectCommonFields<D>(data: D): D & InjectedFields {
    const result = { ...data } as D & InjectedFields;

    if (this.functionId != null) {
      result.functionId = this.functionId;
    }

    if (this.metadata != null) {
      result.metadata = {
        ...(result as { metadata?: Record<string, TelemetryAttributeValue> })
          .metadata,
        ...this.metadata,
      };
    }

    return result;
  }
}
