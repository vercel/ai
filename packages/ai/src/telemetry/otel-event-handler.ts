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
import { assembleOperationName } from './assemble-operation-name';
import { getBaseTelemetryAttributes } from './get-base-telemetry-attributes';
import { getTracer } from './get-tracer';
import { stringifyForTelemetry } from './stringify-for-telemetry';
import { TelemetrySettings } from './telemetry-settings';
import type { TelemetryIntegration } from './telemetry-integration';
import { registerTelemetryIntegration } from './telemetry-integration-registry';

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

interface OtelStepStartEvent<
  TOOLS extends ToolSet = ToolSet,
  OUTPUT extends Output = Output,
> extends OnStepStartEvent<TOOLS, OUTPUT> {
  readonly promptMessages?: LanguageModelV3Prompt;
  readonly stepTools?: ReadonlyArray<Record<string, unknown>>;
  readonly stepToolChoice?: unknown;
}

interface CallState {
  telemetry: TelemetrySettings | undefined;
  rootSpan: Span | undefined;
  rootContext: Context | undefined;
  stepSpan: Span | undefined;
  stepContext: Context | undefined;
  toolSpans: Map<string, { span: Span; context: Context }>;
  baseTelemetryAttributes: Attributes;
  settings: Record<string, unknown>;
}

const callStates = new Map<string, CallState>();

function getCallState(callId: string): CallState | undefined {
  return callStates.get(callId);
}

function cleanupCallState(callId: string): void {
  callStates.delete(callId);
}

const otelIntegration: TelemetryIntegration = {
  onStart(event: OnStartEvent<ToolSet, Output>): void {
    const telemetry = event.telemetry;
    if (telemetry?.isEnabled === false) return;

    const tracer = getTracer(telemetry);

    const settings: Record<string, unknown> = {
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

    const baseTelemetryAttributes = getBaseTelemetryAttributes({
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

    const rootSpan = tracer.startSpan('ai.generateText', { attributes });
    const rootContext = trace.setSpan(context.active(), rootSpan);

    callStates.set(event.callId, {
      telemetry,
      rootSpan,
      rootContext,
      stepSpan: undefined,
      stepContext: undefined,
      toolSpans: new Map(),
      baseTelemetryAttributes,
      settings,
    });
  },

  onStepStart(event: OtelStepStartEvent<ToolSet, Output>): void {
    const state = getCallState(event.callId);
    if (!state?.rootSpan || !state.rootContext) return;

    const { telemetry } = state;

    const attributes = selectAttributes(telemetry, {
      ...assembleOperationName({
        operationId: 'ai.generateText.doGenerate',
        telemetry,
      }),
      ...state.baseTelemetryAttributes,
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
      'gen_ai.request.frequency_penalty': state.settings.frequencyPenalty as
        | number
        | undefined,
      'gen_ai.request.max_tokens': state.settings.maxOutputTokens as
        | number
        | undefined,
      'gen_ai.request.presence_penalty': state.settings.presencePenalty as
        | number
        | undefined,
      'gen_ai.request.stop_sequences': state.settings.stopSequences as
        | string[]
        | undefined,
      'gen_ai.request.temperature': (state.settings.temperature ??
        undefined) as number | undefined,
      'gen_ai.request.top_k': state.settings.topK as number | undefined,
      'gen_ai.request.top_p': state.settings.topP as number | undefined,
    });

    const tracer = getTracer(telemetry);
    state.stepSpan = tracer.startSpan(
      'ai.generateText.doGenerate',
      { attributes },
      state.rootContext,
    );
    state.stepContext = trace.setSpan(state.rootContext, state.stepSpan);
  },

  onToolCallStart(event: OnToolCallStartEvent<ToolSet>): void {
    const state = getCallState(event.callId);
    if (!state?.stepContext) return;

    const { telemetry } = state;
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

    const tracer = getTracer(telemetry);
    const toolSpan = tracer.startSpan(
      'ai.toolCall',
      { attributes },
      state.stepContext,
    );
    const toolContext = trace.setSpan(state.stepContext, toolSpan);

    state.toolSpans.set(toolCall.toolCallId, {
      span: toolSpan,
      context: toolContext,
    });
  },

  onToolCallFinish(event: OnToolCallFinishEvent<ToolSet>): void {
    const state = getCallState(event.callId);
    if (!state) return;

    const toolSpanEntry = state.toolSpans.get(event.toolCall.toolCallId);
    if (!toolSpanEntry) return;

    const { span } = toolSpanEntry;
    const { telemetry } = state;

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
    state.toolSpans.delete(event.toolCall.toolCallId);
  },

  onStepFinish(event: OnStepFinishEvent<ToolSet>): void {
    const state = getCallState(event.callId);
    if (!state?.stepSpan) return;

    const { telemetry } = state;

    state.stepSpan.setAttributes(
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

    state.stepSpan.end();
    state.stepSpan = undefined;
    state.stepContext = undefined;
  },

  onFinish(event: OnFinishEvent<ToolSet>): void {
    const state = getCallState(event.callId);
    if (!state?.rootSpan) return;

    const { telemetry } = state;

    state.rootSpan.setAttributes(
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

    state.rootSpan.end();
    cleanupCallState(event.callId);
  },

  recordError(error: unknown): void {
    // recordError receives the raw error; we need callId to look up state.
    // The callId is attached to the error event by generate-text.ts via
    // the globalTelemetry.recordError composite which wraps it.
    // However, since TelemetryIntegration.recordError is Listener<unknown>,
    // we accept a { callId, error } shape here.
    const event = error as { callId?: string; error?: unknown };
    if (!event?.callId) return;

    const state = getCallState(event.callId);
    if (!state?.rootSpan) return;

    const actualError = event.error ?? error;

    if (state.stepSpan) {
      if (actualError instanceof Error) {
        state.stepSpan.recordException({
          name: actualError.name,
          message: actualError.message,
          stack: actualError.stack,
        });
        state.stepSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: actualError.message,
        });
      } else {
        state.stepSpan.setStatus({ code: SpanStatusCode.ERROR });
      }
      state.stepSpan.end();
    }

    if (actualError instanceof Error) {
      state.rootSpan.recordException({
        name: actualError.name,
        message: actualError.message,
        stack: actualError.stack,
      });
      state.rootSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: actualError.message,
      });
    } else {
      state.rootSpan.setStatus({ code: SpanStatusCode.ERROR });
    }

    state.rootSpan.end();
    cleanupCallState(event.callId);
  },
};

registerTelemetryIntegration(otelIntegration);
