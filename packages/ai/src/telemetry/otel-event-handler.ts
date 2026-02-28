import { LanguageModelV3Prompt } from '@ai-sdk/provider';
import {
  context,
  trace,
  Span,
  Context,
  Attributes,
  AttributeValue,
  SpanStatusCode,
} from '@opentelemetry/api';
import type {
  OnFinishEvent,
  OnStartEvent,
  OnStepFinishEvent,
  OnStepStartEvent,
  OnToolCallFinishEvent,
  OnToolCallStartEvent,
} from '../generate-text/callback-events';
import type { Output } from '../generate-text/output';
import type { ToolSet } from '../generate-text/tool-set';
import {
  bindTelemetryHandler,
  TelemetryHandler,
} from '../generate-text/telemetry-handler';
import { assembleOperationName } from './assemble-operation-name';
import { getBaseTelemetryAttributes } from './get-base-telemetry-attributes';
import { getTracer } from './get-tracer';
import { stringifyForTelemetry } from './stringify-for-telemetry';
import { TelemetrySettings } from './telemetry-settings';

function shouldRecord(
  telemetry: TelemetrySettings | undefined,
): telemetry is TelemetrySettings {
  return telemetry?.isEnabled === true;
}

function selectAttributes(
  telemetry: TelemetrySettings | undefined,
  attributes: Record<
    string,
    | AttributeValue
    | { input: () => AttributeValue | undefined }
    | { output: () => AttributeValue | undefined }
    | undefined
  >,
): Attributes {
  if (!shouldRecord(telemetry)) {
    return {};
  }

  const result: Attributes = {};

  for (const [key, value] of Object.entries(attributes)) {
    if (value == null) continue;

    if (
      typeof value === 'object' &&
      'input' in value &&
      typeof value.input === 'function'
    ) {
      if (telemetry?.recordInputs === false) continue;
      const resolved = value.input();
      if (resolved != null) result[key] = resolved;
      continue;
    }

    if (
      typeof value === 'object' &&
      'output' in value &&
      typeof value.output === 'function'
    ) {
      if (telemetry?.recordOutputs === false) continue;
      const resolved = value.output();
      if (resolved != null) result[key] = resolved;
      continue;
    }

    result[key] = value as AttributeValue;
  }

  return result;
}

/**
 * Extended step start event with language-model-level details for OTel spans.
 */
interface OtelStepStartEvent<
  TOOLS extends ToolSet = ToolSet,
  OUTPUT extends Output = Output,
> extends OnStepStartEvent<TOOLS, OUTPUT> {
  readonly promptMessages?: LanguageModelV3Prompt;
  readonly stepTools?: ReadonlyArray<Record<string, unknown>>;
  readonly stepToolChoice?: unknown;
}

/**
 * OTel handler with additional error recording capability.
 */
export interface OtelTelemetryHandler<
  TOOLS extends ToolSet = ToolSet,
  OUTPUT extends Output = Output,
> extends TelemetryHandler<TOOLS, OUTPUT> {
  recordError(error: unknown): void;
}

/**
 * Creates per-call OTel telemetry state and event handlers.
 * All span state lives in the returned closure — no module-level state.
 * Methods are automatically bound for safe use as callbacks.
 */
export function createOtelCallHandler<
  TOOLS extends ToolSet = ToolSet,
  OUTPUT extends Output = Output,
>(
  telemetry: TelemetrySettings | undefined,
): OtelTelemetryHandler<TOOLS, OUTPUT> {
  const tracer = getTracer(telemetry);

  let rootSpan: Span | undefined;
  let rootContext: Context | undefined;
  let stepSpan: Span | undefined;
  let stepContext: Context | undefined;
  const toolSpans = new Map<string, { span: Span; context: Context }>();
  let baseTelemetryAttributes: Attributes = {};
  let settings: Record<string, unknown> = {};

  const handler = {
    recordError(error: unknown): void {
      if (!rootSpan) return;

      if (stepSpan) {
        if (error instanceof Error) {
          stepSpan.recordException({
            name: error.name,
            message: error.message,
            stack: error.stack,
          });
          stepSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
        } else {
          stepSpan.setStatus({ code: SpanStatusCode.ERROR });
        }
        stepSpan.end();
      }

      if (error instanceof Error) {
        rootSpan.recordException({
          name: error.name,
          message: error.message,
          stack: error.stack,
        });
        rootSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
      } else {
        rootSpan.setStatus({ code: SpanStatusCode.ERROR });
      }

      rootSpan.end();
    },

    onStart(event: OnStartEvent<TOOLS, OUTPUT>): void {
      settings = {
        maxOutputTokens: event.maxOutputTokens,
        temperature: event.temperature,
        topP: event.topP,
        topK: event.topK,
        presencePenalty: event.presencePenalty,
        frequencyPenalty: event.frequencyPenalty,
        stopSequences: event.stopSequences,
        seed: event.seed,
        maxRetries: event.maxRetries,
      };

      baseTelemetryAttributes = getBaseTelemetryAttributes({
        model: event.model,
        telemetry,
        headers: event.headers,
        settings,
      });

      const attributes = selectAttributes(telemetry, {
        ...assembleOperationName({
          operationId: 'ai.generateText',
          telemetry,
        }),
        ...baseTelemetryAttributes,
        'ai.model.provider': event.model.provider,
        'ai.model.id': event.model.modelId,
        'ai.prompt': {
          input: () =>
            JSON.stringify({
              system: event.system,
              prompt: event.prompt,
              messages: event.messages,
            }),
        },
      });

      rootSpan = tracer.startSpan('ai.generateText', { attributes });
      rootContext = trace.setSpan(context.active(), rootSpan);
    },

    onStepStart(event: OtelStepStartEvent<TOOLS, OUTPUT>): void {
      if (!rootSpan || !rootContext) return;

      const attributes = selectAttributes(telemetry, {
        ...assembleOperationName({
          operationId: 'ai.generateText.doGenerate',
          telemetry,
        }),
        ...baseTelemetryAttributes,
        'ai.model.provider': event.model.provider,
        'ai.model.id': event.model.modelId,

        'ai.prompt.messages': {
          input: () =>
            event.promptMessages
              ? stringifyForTelemetry(event.promptMessages)
              : undefined,
        },
        'ai.prompt.tools': {
          input: () => event.stepTools?.map(tool => JSON.stringify(tool)),
        },
        'ai.prompt.toolChoice': {
          input: () =>
            event.stepToolChoice != null
              ? JSON.stringify(event.stepToolChoice)
              : undefined,
        },

        'gen_ai.system': event.model.provider,
        'gen_ai.request.model': event.model.modelId,
        'gen_ai.request.frequency_penalty': settings.frequencyPenalty as
          | number
          | undefined,
        'gen_ai.request.max_tokens': settings.maxOutputTokens as
          | number
          | undefined,
        'gen_ai.request.presence_penalty': settings.presencePenalty as
          | number
          | undefined,
        'gen_ai.request.stop_sequences': settings.stopSequences as
          | string[]
          | undefined,
        'gen_ai.request.temperature': (settings.temperature ?? undefined) as
          | number
          | undefined,
        'gen_ai.request.top_k': settings.topK as number | undefined,
        'gen_ai.request.top_p': settings.topP as number | undefined,
      });

      stepSpan = tracer.startSpan(
        'ai.generateText.doGenerate',
        { attributes },
        rootContext,
      );
      stepContext = trace.setSpan(rootContext, stepSpan);
    },

    onToolCallStart(event: OnToolCallStartEvent<TOOLS>): void {
      if (!stepContext) return;

      const { toolCall } = event;

      const attributes = selectAttributes(telemetry, {
        ...assembleOperationName({
          operationId: 'ai.toolCall',
          telemetry,
        }),
        'ai.toolCall.name': toolCall.toolName,
        'ai.toolCall.id': toolCall.toolCallId,
        'ai.toolCall.args': {
          output: () => JSON.stringify(toolCall.input),
        },
      });

      const toolSpan = tracer.startSpan(
        'ai.toolCall',
        { attributes },
        stepContext,
      );
      const toolContext = trace.setSpan(stepContext, toolSpan);

      toolSpans.set(toolCall.toolCallId, {
        span: toolSpan,
        context: toolContext,
      });
    },

    onToolCallFinish(event: OnToolCallFinishEvent<TOOLS>): void {
      const toolSpanEntry = toolSpans.get(event.toolCall.toolCallId);
      if (!toolSpanEntry) return;

      const { span } = toolSpanEntry;

      if (event.success) {
        try {
          span.setAttributes(
            selectAttributes(telemetry, {
              'ai.toolCall.result': {
                output: () => JSON.stringify(event.output),
              },
            }),
          );
        } catch (_ignored) {
          // JSON.stringify might fail for non-serializable results
        }
      } else {
        if (event.error instanceof Error) {
          span.recordException({
            name: event.error.name,
            message: event.error.message,
            stack: event.error.stack,
          });
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: event.error.message,
          });
        } else {
          span.setStatus({ code: SpanStatusCode.ERROR });
        }
      }

      span.end();
      toolSpans.delete(event.toolCall.toolCallId);
    },

    onStepFinish(event: OnStepFinishEvent<TOOLS>): void {
      if (!stepSpan) return;

      stepSpan.setAttributes(
        selectAttributes(telemetry, {
          'ai.response.finishReason': event.finishReason,
          'ai.response.text': {
            output: () => event.text || undefined,
          },
          'ai.response.reasoning': {
            output: () => event.reasoningText || undefined,
          },
          'ai.response.toolCalls': {
            output: () => {
              const toolCalls = event.toolCalls;
              return toolCalls.length > 0
                ? JSON.stringify(
                    toolCalls.map(tc => ({
                      toolCallType: 'function',
                      toolCallId: tc.toolCallId,
                      toolName: tc.toolName,
                      args:
                        typeof tc.input === 'string'
                          ? tc.input
                          : JSON.stringify(tc.input),
                    })),
                  )
                : undefined;
            },
          },
          'ai.response.id': event.response.id,
          'ai.response.model': event.response.modelId,
          'ai.response.timestamp': event.response.timestamp.toISOString(),
          'ai.response.providerMetadata': event.providerMetadata
            ? JSON.stringify(event.providerMetadata)
            : undefined,

          'ai.usage.promptTokens': event.usage.inputTokens,
          'ai.usage.completionTokens': event.usage.outputTokens,

          'gen_ai.response.finish_reasons': [event.finishReason],
          'gen_ai.response.id': event.response.id,
          'gen_ai.response.model': event.response.modelId,
          'gen_ai.usage.input_tokens': event.usage.inputTokens,
          'gen_ai.usage.output_tokens': event.usage.outputTokens,
        }),
      );

      stepSpan.end();
      stepSpan = undefined;
      stepContext = undefined;
    },

    onFinish(event: OnFinishEvent<TOOLS>): void {
      if (!rootSpan) return;

      rootSpan.setAttributes(
        selectAttributes(telemetry, {
          'ai.response.finishReason': event.finishReason,
          'ai.response.text': {
            output: () => event.text || undefined,
          },
          'ai.response.reasoning': {
            output: () => event.reasoningText || undefined,
          },
          'ai.response.toolCalls': {
            output: () => {
              const toolCalls = event.toolCalls;
              return toolCalls.length > 0
                ? JSON.stringify(
                    toolCalls.map(tc => ({
                      toolCallType: 'function',
                      toolCallId: tc.toolCallId,
                      toolName: tc.toolName,
                      args:
                        typeof tc.input === 'string'
                          ? tc.input
                          : JSON.stringify(tc.input),
                    })),
                  )
                : undefined;
            },
          },
          'ai.response.providerMetadata': event.providerMetadata
            ? JSON.stringify(event.providerMetadata)
            : undefined,

          'ai.usage.promptTokens': event.totalUsage.inputTokens,
          'ai.usage.completionTokens': event.totalUsage.outputTokens,
        }),
      );

      rootSpan.end();
    },
  };

  return {
    ...bindTelemetryHandler(handler),
    recordError: handler.recordError.bind(handler),
  };
}
