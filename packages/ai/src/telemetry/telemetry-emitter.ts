import type {
  TelemetryConfig,
  TelemetryHandler,
  TelemetryEventData,
  TelemetryAttributeValue,
} from './types';
import { noopHandler } from './handlers/noop-handler';
import { getActiveTrace } from './create-trace';

/**
 * Internal class used by AI SDK core functions to emit telemetry events.
 *
 * Handles:
 * - Resolving the handler from TelemetryConfig (or noop if undefined)
 * - Stripping input/output fields based on recordInputs/recordOutputs
 * - Injecting functionId and metadata into event data
 *
 * Core functions create an instance and call its methods at lifecycle points,
 * passing structured TelemetryEventData objects.
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
  startOperation({
    operationId,
    operationName,
    parentOperationId,
    data,
  }: {
    operationId: string;
    operationName: string;
    parentOperationId?: string;
    data: TelemetryEventData;
  }): void {
    if (!this.isActive) return;

    const processed = this.processData(data, { injectCommon: true });

    this.handler.onOperationStarted?.({
      type: 'operationStarted',
      operationId,
      operationName,
      parentOperationId: parentOperationId ?? this.parentOperationId,
      startTime: Date.now(),
      data: processed,
    });
  }

  /**
   * Emit an operation-ended event.
   */
  endOperation({
    operationId,
    operationName,
    data,
  }: {
    operationId: string;
    operationName: string;
    data?: TelemetryEventData;
  }): void {
    if (!this.isActive) return;

    const processed = data ? this.processData(data) : {};

    this.handler.onOperationEnded?.({
      type: 'operationEnded',
      operationId,
      operationName,
      endTime: Date.now(),
      data: processed,
    });
  }

  /**
   * Emit an operation-updated event (mid-operation data addition).
   */
  updateOperation({
    operationId,
    operationName,
    data,
  }: {
    operationId: string;
    operationName: string;
    data: TelemetryEventData;
  }): void {
    if (!this.isActive) return;

    const processed = this.processData(data);

    this.handler.onOperationUpdated?.({
      type: 'operationUpdated',
      operationId,
      operationName,
      data: processed,
    });
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
   * Process event data: strip input/output fields based on policy,
   * and optionally inject common fields (functionId, metadata).
   */
  private processData(
    data: TelemetryEventData,
    options?: { injectCommon?: boolean },
  ): TelemetryEventData {
    let result = this.applyDataPolicy(data);

    if (options?.injectCommon) {
      result = this.injectCommonFields(result);
    }

    return result;
  }

  /**
   * Strip input/output classified fields based on recordInputs/recordOutputs.
   *
   * Input fields: prompt, toolCall.args, embedding.value/values, ranking.documents
   * Output fields: response, toolCall.result, embedding.result/results,
   *                ranking.results, stream
   */
  private applyDataPolicy(data: TelemetryEventData): TelemetryEventData {
    const result = { ...data };

    // Strip input content (keep structural markers like prompt.messages presence
    // so handlers can still identify LLM call spans)
    if (!this.recordInputs) {
      if (result.prompt) {
        result.prompt = {
          // Preserve the messages marker (empty array) so handlers know
          // this is an LLM call span, but strip actual content
          messages: result.prompt.messages != null ? [] : undefined,
          raw: undefined,
          tools: undefined,
          toolChoice: undefined,
        };
      }

      if (result.toolCall) {
        result.toolCall = { ...result.toolCall, args: undefined };
      }
      if (result.embedding) {
        result.embedding = {
          ...result.embedding,
          value: undefined,
          values: undefined,
        };
      }
      if (result.ranking) {
        result.ranking = { ...result.ranking, documents: undefined };
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
          toolCalls: undefined,
          providerMetadata: undefined,
        };
      }
      delete result.stream;

      if (result.toolCall) {
        result.toolCall = { ...result.toolCall, result: undefined };
      }
      if (result.embedding) {
        result.embedding = {
          ...result.embedding,
          result: undefined,
          results: undefined,
        };
      }
      if (result.ranking) {
        result.ranking = { ...result.ranking, results: undefined };
      }
    }

    return result;
  }

  /**
   * Inject functionId and metadata from the TelemetryConfig.
   */
  private injectCommonFields(data: TelemetryEventData): TelemetryEventData {
    const result = { ...data };

    if (this.functionId != null) {
      result.functionId = this.functionId;
    }

    if (this.metadata != null) {
      result.metadata = { ...result.metadata, ...this.metadata };
    }

    return result;
  }
}
