import {
  Tracer,
  Span,
  SpanStatusCode,
  context,
  trace,
  type Attributes,
} from '@opentelemetry/api';
import type {
  TelemetryHandler,
  TelemetryAttributeValue,
  OperationStartedEvent,
  OperationEndedEvent,
  OperationUpdatedEvent,
  OperationErrorEvent,
  TelemetryConfig,
  ModelData,
  CallSettingsData,
  ResponseData,
  UsageData,
  InjectedFields,
} from '../types';

interface FlattenableEventData extends InjectedFields {
  model?: ModelData;
  settings?: Partial<CallSettingsData>;
  headers?: Record<string, string>;
  prompt?: {
    raw?: unknown;
    messages?: unknown;
    tools?: unknown[];
    toolChoice?: unknown;
  };
  response?: Partial<ResponseData>;
  usage?: Partial<UsageData>;
  toolCall?: {
    name: string;
    id: string;
    args?: unknown;
    result?: unknown;
  };
}

/**
 * Checks if a value is an OTel-compatible array (homogeneous primitives).
 */
function isOtelCompatibleArray(value: unknown): value is OtelArray {
  if (!Array.isArray(value) || value.length === 0) {
    return Array.isArray(value);
  }
  const firstType = typeof value[0];
  if (
    firstType !== 'string' &&
    firstType !== 'number' &&
    firstType !== 'boolean'
  ) {
    return false;
  }
  return value.every(item => typeof item === firstType);
}

type OtelArray = string[] | number[] | boolean[];

/**
 * Converts structured event data into flat OTel attribute key-value pairs.
 *
 * Returns OTel-native Attributes
 */
function flattenToOtelAttributes(data: FlattenableEventData): Attributes {
  const attrs: Attributes = {};

  if (data.model) {
    attrs['ai.model.provider'] = data.model.provider;
    attrs['ai.model.id'] = data.model.id;
    if (data.prompt?.messages != null) {
      attrs['gen_ai.system'] = data.model.provider;
      attrs['gen_ai.request.model'] = data.model.id;
    }
  }

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

  if (data.headers) {
    for (const [key, value] of Object.entries(data.headers)) {
      if (value != null) {
        attrs[`ai.request.headers.${key}`] = value;
      }
    }
  }

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
    if (data.response.reasoning != null) {
      attrs['ai.response.reasoning'] = data.response.reasoning;
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

  if (data.metadata) {
    for (const [key, value] of Object.entries(data.metadata)) {
      if (value == null) continue;

      // Serialize objects/nested arrays to JSON strings for OTel compatibility
      if (typeof value === 'object' && !isOtelCompatibleArray(value)) {
        attrs[`ai.telemetry.metadata.${key}`] = JSON.stringify(value);
      } else {
        attrs[`ai.telemetry.metadata.${key}`] = value as
          | string
          | number
          | boolean
          | string[]
          | number[]
          | boolean[];
      }
    }
  }

  if (data.functionId != null) {
    attrs['ai.telemetry.functionId'] = data.functionId;
    attrs['resource.name'] = data.functionId;
  }

  return attrs;
}

/**
 * Creates a TelemetryHandler backed by OpenTelemetry.
 *
 * Parent-child relationships are established via `parentOperationId`
 * using explicit parent context references.
 */
function createOtelHandler(tracer: Tracer): TelemetryHandler {
  const spans = new Map<string, Span>();

  const llmCallSpans = new Set<string>();

  return {
    onOperationStarted(event: OperationStartedEvent) {
      const eventData = event.data as FlattenableEventData;
      const otelAttrs = flattenToOtelAttributes(eventData);

      otelAttrs['ai.operationId'] = event.operationName;
      otelAttrs['operation.name'] =
        eventData.functionId != null
          ? `${event.operationName} ${eventData.functionId}`
          : event.operationName;

      if (eventData.prompt?.messages != null) {
        llmCallSpans.add(event.operationId);
      }

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

      span.end(event.endTime);
      spans.delete(event.operationId);
      llmCallSpans.delete(event.operationId);
    },

    onOperationUpdated(event: OperationUpdatedEvent) {
      const span = spans.get(event.operationId);
      if (!span) return;

      const eventData = event.data as FlattenableEventData;
      const data = llmCallSpans.has(event.operationId)
        ? { ...eventData, settings: {} }
        : eventData;

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
 * global `trace.getTracer('ai')` if none is given)
 */
export function otel(options?: {
  tracer?: Tracer;
  functionId?: string;
  metadata?: Record<string, TelemetryAttributeValue>;
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
