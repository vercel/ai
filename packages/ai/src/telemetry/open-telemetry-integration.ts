import { LanguageModelV4Prompt } from '@ai-sdk/provider';
import {
  context,
  trace,
  Span,
  Context,
  Attributes,
  AttributeValue,
  SpanStatusCode,
  Tracer,
} from '@opentelemetry/api';
import type {
  OnChunkEvent,
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
import { stringifyForTelemetry } from './stringify-for-telemetry';
import { TelemetrySettings } from './telemetry-settings';
import type { TelemetryIntegration } from './telemetry-integration';

function recordSpanError(span: Span, error: unknown): void {
  if (error instanceof Error) {
    span.recordException({
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  } else {
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
}

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
  readonly promptMessages?: LanguageModelV4Prompt;
  readonly stepTools?: ReadonlyArray<Record<string, unknown>>;
  readonly stepToolChoice?: unknown;
}

interface CallState {
  operationId: string;
  telemetry: TelemetrySettings | undefined;
  rootSpan: Span | undefined;
  rootContext: Context | undefined;
  stepSpan: Span | undefined;
  stepContext: Context | undefined;
  toolSpans: Map<string, { span: Span; context: Context }>;
  baseTelemetryAttributes: Attributes;
  settings: Record<string, unknown>;
}

export class OpenTelemetryIntegration implements TelemetryIntegration {
  private readonly callStates = new Map<string, CallState>();

  /**
   * The tracer to use for the telemetry data.
   */
  private readonly tracer: Tracer;

  constructor(
    options: {
      tracer?: Tracer;
    } = {},
  ) {
    this.tracer = options.tracer ?? trace.getTracer('ai');
  }

  private getCallState(callId: string): CallState | undefined {
    return this.callStates.get(callId);
  }

  private cleanupCallState(callId: string): void {
    this.callStates.delete(callId);
  }

  executeTool<T>({
    callId,
    toolCallId,
    execute,
  }: {
    callId: string;
    toolCallId: string;
    execute: () => PromiseLike<T>;
  }): PromiseLike<T> {
    const toolSpanEntry = this.getCallState(callId)?.toolSpans.get(toolCallId);

    if (toolSpanEntry == null) {
      return execute();
    }

    return context.with(toolSpanEntry.context, execute);
  }

  onStart(event: OnStartEvent<ToolSet, Output>): void {
    if (event.isEnabled !== true) return;

    const telemetry: TelemetrySettings = {
      isEnabled: event.isEnabled,
      recordInputs: event.recordInputs,
      recordOutputs: event.recordOutputs,
      functionId: event.functionId,
      metadata: event.metadata,
    };

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
        operationId: event.operationId,
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

    const rootSpan = this.tracer.startSpan(event.operationId, { attributes });
    const rootContext = trace.setSpan(context.active(), rootSpan);

    this.callStates.set(event.callId, {
      operationId: event.operationId,
      telemetry,
      rootSpan,
      rootContext,
      stepSpan: undefined,
      stepContext: undefined,
      toolSpans: new Map(),
      baseTelemetryAttributes,
      settings,
    });
  }

  onStepStart(event: OtelStepStartEvent<ToolSet, Output>): void {
    const state = this.getCallState(event.callId);
    if (!state?.rootSpan || !state.rootContext) return;

    const { telemetry } = state;

    const stepOperationId =
      state.operationId === 'ai.streamText'
        ? 'ai.streamText.doStream'
        : 'ai.generateText.doGenerate';

    const attributes = selectAttributes(telemetry, {
      ...assembleOperationName({
        operationId: stepOperationId,
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

    state.stepSpan = this.tracer.startSpan(
      stepOperationId,
      { attributes },
      state.rootContext,
    );
    state.stepContext = trace.setSpan(state.rootContext, state.stepSpan);
  }

  onToolCallStart(event: OnToolCallStartEvent<ToolSet>): void {
    const state = this.getCallState(event.callId);
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

    const toolSpan = this.tracer.startSpan(
      'ai.toolCall',
      { attributes },
      state.stepContext,
    );
    const toolContext = trace.setSpan(state.stepContext, toolSpan);

    state.toolSpans.set(toolCall.toolCallId, {
      span: toolSpan,
      context: toolContext,
    });
  }

  onToolCallFinish(event: OnToolCallFinishEvent<ToolSet>): void {
    const state = this.getCallState(event.callId);
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
      recordSpanError(span, event.error);
    }

    span.end();
    state.toolSpans.delete(event.toolCall.toolCallId);
  }

  onStepFinish(event: OnStepFinishEvent<ToolSet>): void {
    const state = this.getCallState(event.callId);
    if (!state?.stepSpan) return;

    const { telemetry } = state;

    state.stepSpan.setAttributes(
      selectAttributes(telemetry, {
        'ai.response.finishReason': event.finishReason,
        'ai.response.text': {
          output: () => event.text ?? undefined,
        },
        'ai.response.reasoning': {
          output: () =>
            event.reasoning.length > 0
              ? event.reasoning
                  .filter(part => 'text' in part)
                  .map(part => part.text)
                  .join('\n')
              : undefined,
        },
        'ai.response.toolCalls': {
          output: () =>
            event.toolCalls.length > 0
              ? JSON.stringify(
                  event.toolCalls.map(toolCall => ({
                    toolCallId: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    input: toolCall.input,
                  })),
                )
              : undefined,
        },
        'ai.response.id': event.response.id,
        'ai.response.model': event.response.modelId,
        'ai.response.timestamp': event.response.timestamp.toISOString(),
        'ai.response.providerMetadata': event.providerMetadata
          ? JSON.stringify(event.providerMetadata)
          : undefined,

        'ai.usage.inputTokens': event.usage.inputTokens,
        'ai.usage.outputTokens': event.usage.outputTokens,
        'ai.usage.totalTokens': event.usage.totalTokens,
        'ai.usage.reasoningTokens': event.usage.reasoningTokens,
        'ai.usage.cachedInputTokens': event.usage.cachedInputTokens,
        'ai.usage.inputTokenDetails.noCacheTokens':
          event.usage.inputTokenDetails?.noCacheTokens,
        'ai.usage.inputTokenDetails.cacheReadTokens':
          event.usage.inputTokenDetails?.cacheReadTokens,
        'ai.usage.inputTokenDetails.cacheWriteTokens':
          event.usage.inputTokenDetails?.cacheWriteTokens,
        'ai.usage.outputTokenDetails.textTokens':
          event.usage.outputTokenDetails?.textTokens,
        'ai.usage.outputTokenDetails.reasoningTokens':
          event.usage.outputTokenDetails?.reasoningTokens,

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
  }

  onFinish(event: OnFinishEvent<ToolSet>): void {
    const state = this.getCallState(event.callId);
    if (!state?.rootSpan) return;

    const { telemetry } = state;

    state.rootSpan.setAttributes(
      selectAttributes(telemetry, {
        'ai.response.finishReason': event.finishReason,
        'ai.response.text': {
          output: () => event.text ?? undefined,
        },
        'ai.response.reasoning': {
          output: () =>
            event.reasoning.length > 0
              ? event.reasoning
                  .filter(part => 'text' in part)
                  .map(part => part.text)
                  .join('\n')
              : undefined,
        },
        'ai.response.toolCalls': {
          output: () =>
            event.toolCalls.length > 0
              ? JSON.stringify(
                  event.toolCalls.map(toolCall => ({
                    toolCallId: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    input: toolCall.input,
                  })),
                )
              : undefined,
        },
        'ai.response.providerMetadata': event.providerMetadata
          ? JSON.stringify(event.providerMetadata)
          : undefined,

        'ai.usage.inputTokens': event.totalUsage.inputTokens,
        'ai.usage.outputTokens': event.totalUsage.outputTokens,
        'ai.usage.totalTokens': event.totalUsage.totalTokens,
        'ai.usage.reasoningTokens': event.totalUsage.reasoningTokens,
        'ai.usage.cachedInputTokens': event.totalUsage.cachedInputTokens,
        'ai.usage.inputTokenDetails.noCacheTokens':
          event.totalUsage.inputTokenDetails?.noCacheTokens,
        'ai.usage.inputTokenDetails.cacheReadTokens':
          event.totalUsage.inputTokenDetails?.cacheReadTokens,
        'ai.usage.inputTokenDetails.cacheWriteTokens':
          event.totalUsage.inputTokenDetails?.cacheWriteTokens,
        'ai.usage.outputTokenDetails.textTokens':
          event.totalUsage.outputTokenDetails?.textTokens,
        'ai.usage.outputTokenDetails.reasoningTokens':
          event.totalUsage.outputTokenDetails?.reasoningTokens,
      }),
    );

    state.rootSpan.end();
    this.cleanupCallState(event.callId);
  }

  onChunk(event: OnChunkEvent<ToolSet>): void {
    const chunk = event.chunk as {
      type: string;
      callId?: unknown;
      attributes?: unknown;
    };

    if (typeof chunk.callId !== 'string') {
      return;
    }

    if (
      chunk.type !== 'ai.stream.firstChunk' &&
      chunk.type !== 'ai.stream.finish'
    ) {
      return;
    }

    const state = this.getCallState(chunk.callId);
    if (!state?.stepSpan) return;

    const attributes = Object.fromEntries(
      Object.entries(
        (chunk.attributes as Record<string, unknown>) ?? {},
      ).filter(([, value]) => value != null),
    ) as Attributes;

    state.stepSpan.addEvent(chunk.type, attributes);
    if (Object.keys(attributes).length > 0) {
      state.stepSpan.setAttributes(attributes);
    }
  }

  onError(error: unknown): void {
    // onError receives the raw error; we need callId to look up state.
    // The callId is attached to the error event by generate-text.ts via
    // the globalTelemetry.onError composite which wraps it.
    // However, since TelemetryIntegration.onError is Listener<unknown>,
    // we accept a { callId, error } shape here.
    const event = error as { callId?: string; error?: unknown };
    if (!event?.callId) return;

    const state = this.getCallState(event.callId);
    if (!state?.rootSpan) return;

    const actualError = event.error ?? error;

    if (state.stepSpan) {
      recordSpanError(state.stepSpan, actualError);
      state.stepSpan.end();
    }

    recordSpanError(state.rootSpan, actualError);

    state.rootSpan.end();
    this.cleanupCallState(event.callId);
  }
}
