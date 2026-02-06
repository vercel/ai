import {
  Tracer,
  Span,
  SpanStatusCode,
  context,
  trace,
} from '@opentelemetry/api';
import type {
  TelemetryHandler,
  TelemetryAttributes,
  TelemetryEventData,
  OperationStartedEvent,
  OperationEndedEvent,
  OperationUpdatedEvent,
  OperationErrorEvent,
  TelemetryConfig,
} from '../types';

// ---------------------------------------------------------------------------
// Flatten structured TelemetryEventData → flat OTel attributes
// ---------------------------------------------------------------------------

/**
 * Converts structured TelemetryEventData into flat OTel attribute key-value pairs.
 *
 * This function owns ALL `ai.*` and `gen_ai.*` attribute key naming.
 * No other file in the SDK should reference these string keys.
 */
function flattenToOtelAttributes(
  data: TelemetryEventData,
): TelemetryAttributes {
  const attrs: TelemetryAttributes = {};

  // ---- Model ----
  if (data.model) {
    attrs['ai.model.provider'] = data.model.provider;
    attrs['ai.model.id'] = data.model.id;
    if (data.prompt?.messages != null) {
      attrs['gen_ai.system'] = data.model.provider;
      attrs['gen_ai.request.model'] = data.model.id;
    }
  }

  // ---- Settings ----
  if (data.settings) {
    for (const [key, value] of Object.entries(data.settings)) {
      if (value == null) continue;

      if (typeof value !== 'object' || Array.isArray(value)) {
        attrs[`ai.settings.${key}`] = value as
          | string
          | number
          | boolean
          | string[]
          | number[];
      }
    }

    if (data.prompt?.messages != null) {
      if (data.settings.temperature != null) {
        attrs['gen_ai.request.temperature'] = data.settings.temperature;
      }
      if (data.settings.maxOutputTokens != null) {
        attrs['gen_ai.request.max_tokens'] = data.settings.maxOutputTokens;
      }
      if (data.settings.topP != null) {
        attrs['gen_ai.request.top_p'] = data.settings.topP;
      }
      if (data.settings.topK != null) {
        attrs['gen_ai.request.top_k'] = data.settings.topK;
      }
      if (data.settings.frequencyPenalty != null) {
        attrs['gen_ai.request.frequency_penalty'] =
          data.settings.frequencyPenalty;
      }
      if (data.settings.presencePenalty != null) {
        attrs['gen_ai.request.presence_penalty'] =
          data.settings.presencePenalty;
      }
      if (data.settings.stopSequences != null) {
        attrs['gen_ai.request.stop_sequences'] = data.settings.stopSequences;
      }
    }
  }

  // ---- Headers ----
  if (data.headers) {
    for (const [key, value] of Object.entries(data.headers)) {
      if (value != null) {
        attrs[`ai.request.headers.${key}`] = value;
      }
    }
  }

  // ---- Prompt (input) ----
  if (data.prompt) {
    if (data.prompt.raw != null) {
      attrs['ai.prompt'] = JSON.stringify(data.prompt.raw);
    }
    if (
      data.prompt.messages != null &&
      (!Array.isArray(data.prompt.messages) || data.prompt.messages.length > 0)
    ) {
      attrs['ai.prompt.messages'] = JSON.stringify(data.prompt.messages);
    }
    if (data.prompt.tools != null) {
      attrs['ai.prompt.tools'] = data.prompt.tools.map(t => JSON.stringify(t));
    }
    if (data.prompt.toolChoice != null) {
      attrs['ai.prompt.toolChoice'] = JSON.stringify(data.prompt.toolChoice);
    }
  }

  // ---- Response (output) ----
  if (data.response) {
    if (data.response.id != null) {
      attrs['ai.response.id'] = data.response.id;
    }
    if (data.response.model != null) {
      attrs['ai.response.model'] = data.response.model;
    }
    if (data.response.timestamp != null) {
      attrs['ai.response.timestamp'] = data.response.timestamp;
    }
    if (data.response.finishReason != null) {
      attrs['ai.response.finishReason'] = data.response.finishReason;
    }
    if (data.response.text != null) {
      attrs['ai.response.text'] = data.response.text;
    }
    if (data.response.toolCalls != null) {
      attrs['ai.response.toolCalls'] = JSON.stringify(data.response.toolCalls);
    }
    if (data.response.providerMetadata != null) {
      attrs['ai.response.providerMetadata'] = JSON.stringify(
        data.response.providerMetadata,
      );
    }

    if (data.settings || data.prompt?.messages != null) {
      if (data.response.id != null) {
        attrs['gen_ai.response.id'] = data.response.id;
      }
      if (data.response.model != null) {
        attrs['gen_ai.response.model'] = data.response.model;
      }
      if (data.response.finishReason != null) {
        attrs['gen_ai.response.finish_reasons'] = [data.response.finishReason];
      }
    }
  }

  // ---- Usage ----
  if (data.usage) {
    if (data.usage.inputTokens != null) {
      attrs['ai.usage.promptTokens'] = data.usage.inputTokens;
    }
    if (data.usage.outputTokens != null) {
      attrs['ai.usage.completionTokens'] = data.usage.outputTokens;
    }

    if (data.settings || data.prompt?.messages != null) {
      if (data.usage.inputTokens != null) {
        attrs['gen_ai.usage.input_tokens'] = data.usage.inputTokens;
      }
      if (data.usage.outputTokens != null) {
        attrs['gen_ai.usage.output_tokens'] = data.usage.outputTokens;
      }
    }
  }

  // ---- Tool call ----
  if (data.toolCall) {
    attrs['ai.toolCall.name'] = data.toolCall.name;
    attrs['ai.toolCall.id'] = data.toolCall.id;
    if (data.toolCall.args != null) {
      attrs['ai.toolCall.args'] = JSON.stringify(data.toolCall.args);
    }
    if (data.toolCall.result != null) {
      attrs['ai.toolCall.result'] = JSON.stringify(data.toolCall.result);
    }
  }

  // ---- Embedding ----
  if (data.embedding) {
    if (data.embedding.value != null) {
      attrs['ai.value'] = JSON.stringify(data.embedding.value);
    }
    if (data.embedding.values != null) {
      attrs['ai.values'] = JSON.stringify(data.embedding.values);
    }
    if (data.embedding.result != null) {
      attrs['ai.embedding'] = JSON.stringify(data.embedding.result);
    }
    if (data.embedding.results != null) {
      attrs['ai.embeddings'] = JSON.stringify(data.embedding.results);
    }
  }

  // ---- Ranking ----
  if (data.ranking) {
    if (data.ranking.type != null) {
      attrs['ai.ranking.type'] = data.ranking.type;
    }
    if (data.ranking.documents != null) {
      attrs['ai.documents'] = JSON.stringify(data.ranking.documents);
    }
    if (data.ranking.results != null) {
      attrs['ai.ranking'] = JSON.stringify(data.ranking.results);
    }
  }

  // ---- Streaming metrics ----
  if (data.stream) {
    if (data.stream.msToFirstChunk != null) {
      attrs['ai.response.msToFirstChunk'] = data.stream.msToFirstChunk;
    }
    if (data.stream.msToFinish != null) {
      attrs['ai.response.msToFinish'] = data.stream.msToFinish;
    }
    if (data.stream.avgOutputTokensPerSecond != null) {
      attrs['ai.response.avgOutputTokensPerSecond'] =
        data.stream.avgOutputTokensPerSecond;
    }
  }

  // ---- Metadata ----
  if (data.metadata) {
    for (const [key, value] of Object.entries(data.metadata)) {
      attrs[`ai.telemetry.metadata.${key}`] = value;
    }
  }

  // ---- Function ID / operation name ----
  if (data.functionId != null) {
    attrs['ai.telemetry.functionId'] = data.functionId;
    attrs['resource.name'] = data.functionId;
  }

  return attrs;
}

// ---------------------------------------------------------------------------
// OTel handler implementation
// ---------------------------------------------------------------------------

/**
 * Creates a TelemetryHandler backed by OpenTelemetry.
 *
 * Translates structured TelemetryEventData into flat OTel span attributes:
 * - `operationStarted` → `tracer.startSpan()` with flattened attributes
 * - `operationEnded` → `span.setAttributes()` + `span.end()`
 * - `operationUpdated` → `span.setAttributes()`
 * - `operationError` → `span.recordException()` + `span.setStatus(ERROR)`
 *
 * Parent-child relationships are established via `parentOperationId`
 * using explicit parent context references.
 */
function createOtelHandler(tracer: Tracer): TelemetryHandler {
  const spans = new Map<string, Span>();

  const llmCallSpans = new Set<string>();

  return {
    onOperationStarted(event: OperationStartedEvent) {
      const otelAttrs = flattenToOtelAttributes(event.data);

      // Operation name attribute
      otelAttrs['ai.operationId'] = event.operationName;
      otelAttrs['operation.name'] =
        event.data.functionId != null
          ? `${event.operationName} ${event.data.functionId}`
          : event.operationName;

      if (event.data.prompt?.messages != null) {
        llmCallSpans.add(event.operationId);
      }

      // Resolve parent context from parentOperationId
      let parentCtx = context.active();
      if (event.parentOperationId) {
        const parentSpan = spans.get(event.parentOperationId);
        if (parentSpan) {
          parentCtx = trace.setSpan(parentCtx, parentSpan);
        }
      }

      const span = tracer.startSpan(
        event.operationName,
        { attributes: otelAttrs, startTime: event.startTime },
        parentCtx,
      );

      spans.set(event.operationId, span);
    },

    onOperationEnded(event: OperationEndedEvent) {
      const span = spans.get(event.operationId);
      if (!span) return;

      const data = llmCallSpans.has(event.operationId)
        ? { ...event.data, settings: {} }
        : event.data;

      const otelAttrs = flattenToOtelAttributes(data);
      if (Object.keys(otelAttrs).length > 0) {
        span.setAttributes(otelAttrs);
      }

      span.end(event.endTime);
      spans.delete(event.operationId);
      llmCallSpans.delete(event.operationId);
    },

    onOperationUpdated(event: OperationUpdatedEvent) {
      const span = spans.get(event.operationId);
      if (!span) return;

      const data = llmCallSpans.has(event.operationId)
        ? { ...event.data, settings: {} }
        : event.data;

      span.setAttributes(flattenToOtelAttributes(data));
    },

    onOperationError(event: OperationErrorEvent) {
      const span = spans.get(event.operationId);
      if (!span) return;

      span.recordException({
        name: event.error.name,
        message: event.error.message,
        stack: event.error.stack,
      });
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: event.error.message,
      });
    },
  };
}

/**
 * Creates a telemetry config backed by OpenTelemetry.
 *
 * The OTel handler creates spans using the provided tracer (or the
 * global `trace.getTracer('ai')` if none is given). Spans carry both
 * AI SDK `ai.*` attributes and GenAI semantic convention `gen_ai.*` attributes.
 *
 * @example Basic usage:
 * ```ts
 * import { otel } from 'ai';
 *
 * await generateText({
 *   model: openai('gpt-4o'),
 *   prompt: 'Hello',
 *   telemetry: otel(),
 * });
 * ```
 *
 * @example With a custom tracer and settings:
 * ```ts
 * await generateText({
 *   model: openai('gpt-4o'),
 *   prompt: 'Hello',
 *   telemetry: {
 *     ...otel({ tracer: myCustomTracer }),
 *     functionId: 'my-chat',
 *     metadata: { environment: 'production' },
 *   },
 * });
 * ```
 */
export function otel(options?: {
  /** A custom OTel tracer. Defaults to `trace.getTracer('ai')`. */
  tracer?: Tracer;
  /** Identifier for grouping telemetry by function. */
  functionId?: string;
  /** Custom metadata included in all events. */
  metadata?: Record<string, string | number | boolean>;
}): TelemetryConfig {
  const tracer = options?.tracer ?? trace.getTracer('ai');
  return {
    handler: createOtelHandler(tracer),
    ...(options?.functionId != null
      ? { functionId: options.functionId }
      : undefined),
    ...(options?.metadata != null ? { metadata: options.metadata } : undefined),
  };
}
