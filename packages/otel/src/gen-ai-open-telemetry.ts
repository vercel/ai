import { LanguageModelV4Prompt } from '@ai-sdk/provider';
import type { Context as AISDKContext } from '@ai-sdk/provider-utils';
import {
  Attributes,
  AttributeValue,
  context,
  Context as OpenTelemetryContext,
  Span,
  SpanKind,
  SpanStatusCode,
  trace,
  Tracer,
} from '@opentelemetry/api';
import type {
  EmbedFinishEvent,
  EmbedOnFinishEvent,
  EmbedOnStartEvent,
  EmbedStartEvent,
  ObjectOnFinishEvent,
  ObjectOnStartEvent,
  ObjectOnStepFinishEvent,
  ObjectOnStepStartEvent,
  OnChunkEvent,
  OnFinishEvent,
  OnStartEvent,
  OnStepFinishEvent,
  OnStepStartEvent,
  OnToolCallFinishEvent,
  OnToolCallStartEvent,
  OutputInterface as Output,
  RerankFinishEvent,
  RerankOnFinishEvent,
  RerankOnStartEvent,
  RerankStartEvent,
  Telemetry,
  TelemetryOptions,
  ToolSet,
} from 'ai';
import {
  formatInputMessages,
  formatModelMessages,
  formatObjectOutputMessages,
  formatOutputMessages,
  formatSystemInstructions,
  mapOperationName,
  mapProviderName,
} from './gen-ai-format-messages';

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
  telemetry: TelemetryOptions | undefined,
): telemetry is TelemetryOptions {
  return telemetry?.isEnabled !== false;
}

function selectAttributes(
  telemetry: TelemetryOptions | undefined,
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
  RUNTIME_CONTEXT extends AISDKContext = AISDKContext,
  OUTPUT extends Output = Output,
> extends OnStepStartEvent<TOOLS, RUNTIME_CONTEXT, OUTPUT> {
  readonly promptMessages?: LanguageModelV4Prompt;
  readonly stepTools?: ReadonlyArray<Record<string, unknown>>;
  readonly stepToolChoice?: unknown;
}

interface CallState {
  operationId: string;
  telemetry: TelemetryOptions | undefined;
  rootSpan: Span | undefined;
  rootContext: OpenTelemetryContext | undefined;
  stepSpan: Span | undefined;
  stepContext: OpenTelemetryContext | undefined;
  embedSpans: Map<string, { span: Span; context: OpenTelemetryContext }>;
  rerankSpan: { span: Span; context: OpenTelemetryContext } | undefined;
  toolSpans: Map<string, { span: Span; context: OpenTelemetryContext }>;
  settings: Record<string, unknown>;
  provider: string;
  modelId: string;
}

export class GenAIOpenTelemetry implements Telemetry {
  private readonly callStates = new Map<string, CallState>();

  private readonly tracer: Tracer;

  constructor(
    options: {
      tracer?: Tracer;
    } = {},
  ) {
    this.tracer = options.tracer ?? trace.getTracer('gen_ai');
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

  onStart(
    event:
      | OnStartEvent
      | ObjectOnStartEvent
      | EmbedOnStartEvent
      | RerankOnStartEvent,
  ): void {
    if (event.isEnabled === false) return;

    if (
      event.operationId === 'ai.embed' ||
      event.operationId === 'ai.embedMany'
    ) {
      this.onEmbedOperationStart(event as EmbedOnStartEvent);
      return;
    }

    if (event.operationId === 'ai.rerank') {
      this.onRerankOperationStart(event as RerankOnStartEvent);
      return;
    }

    if (
      event.operationId === 'ai.generateObject' ||
      event.operationId === 'ai.streamObject'
    ) {
      this.onObjectOperationStart(event as ObjectOnStartEvent);
      return;
    }

    this.onGenerateStart(event as OnStartEvent);
  }

  private onGenerateStart(event: OnStartEvent): void {
    const telemetry: TelemetryOptions = {
      isEnabled: event.isEnabled,
      recordInputs: event.recordInputs,
      recordOutputs: event.recordOutputs,
      functionId: event.functionId,
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

    const providerName = mapProviderName(event.provider);
    const operationName = mapOperationName(event.operationId);

    const attributes = selectAttributes(telemetry, {
      'gen_ai.operation.name': operationName,
      'gen_ai.provider.name': providerName,
      'gen_ai.request.model': event.modelId,
      'gen_ai.agent.name': telemetry.functionId,
      'gen_ai.request.frequency_penalty': event.frequencyPenalty,
      'gen_ai.request.max_tokens': event.maxOutputTokens,
      'gen_ai.request.presence_penalty': event.presencePenalty,
      'gen_ai.request.temperature': (event.temperature ?? undefined) as
        | number
        | undefined,
      'gen_ai.request.top_k': event.topK,
      'gen_ai.request.top_p': event.topP,
      'gen_ai.request.stop_sequences': event.stopSequences,
      'gen_ai.request.seed': event.seed,
      'gen_ai.system_instructions': event.system
        ? {
            input: () =>
              JSON.stringify(formatSystemInstructions(event.system!)),
          }
        : undefined,
      'gen_ai.input.messages': {
        input: () =>
          JSON.stringify(
            formatModelMessages({
              prompt: event.prompt,
              messages: event.messages,
            }),
          ),
      },
    });

    const spanName = `${operationName} ${event.modelId}`;
    const rootSpan = this.tracer.startSpan(spanName, {
      attributes,
      kind: SpanKind.INTERNAL,
    });
    const rootContext = trace.setSpan(context.active(), rootSpan);

    this.callStates.set(event.callId, {
      operationId: event.operationId,
      telemetry,
      rootSpan,
      rootContext,
      stepSpan: undefined,
      stepContext: undefined,
      embedSpans: new Map(),
      rerankSpan: undefined,
      toolSpans: new Map(),
      settings,
      provider: event.provider,
      modelId: event.modelId,
    });
  }

  private onObjectOperationStart(event: ObjectOnStartEvent): void {
    const telemetry: TelemetryOptions = {
      isEnabled: event.isEnabled,
      recordInputs: event.recordInputs,
      recordOutputs: event.recordOutputs,
      functionId: event.functionId,
    };

    const settings: Record<string, unknown> = {
      maxOutputTokens: event.maxOutputTokens,
      temperature: event.temperature,
      topP: event.topP,
      topK: event.topK,
      presencePenalty: event.presencePenalty,
      frequencyPenalty: event.frequencyPenalty,
      seed: event.seed,
      maxRetries: event.maxRetries,
    };

    const providerName = mapProviderName(event.provider);
    const operationName = mapOperationName(event.operationId);

    const attributes = selectAttributes(telemetry, {
      'gen_ai.operation.name': operationName,
      'gen_ai.provider.name': providerName,
      'gen_ai.request.model': event.modelId,
      'gen_ai.agent.name': telemetry.functionId,
      'gen_ai.output.type': 'json',
      'gen_ai.request.frequency_penalty': event.frequencyPenalty,
      'gen_ai.request.max_tokens': event.maxOutputTokens,
      'gen_ai.request.presence_penalty': event.presencePenalty,
      'gen_ai.request.temperature': (event.temperature ?? undefined) as
        | number
        | undefined,
      'gen_ai.request.top_k': event.topK,
      'gen_ai.request.top_p': event.topP,
      'gen_ai.request.seed': event.seed,
      'gen_ai.system_instructions': event.system
        ? {
            input: () =>
              JSON.stringify(formatSystemInstructions(event.system!)),
          }
        : undefined,
      'gen_ai.input.messages': {
        input: () =>
          JSON.stringify(
            formatModelMessages({
              prompt: event.prompt,
              messages: event.messages,
            }),
          ),
      },
    });

    const spanName = `${operationName} ${event.modelId}`;
    const rootSpan = this.tracer.startSpan(spanName, {
      attributes,
      kind: SpanKind.INTERNAL,
    });
    const rootContext = trace.setSpan(context.active(), rootSpan);

    this.callStates.set(event.callId, {
      operationId: event.operationId,
      telemetry,
      rootSpan,
      rootContext,
      stepSpan: undefined,
      stepContext: undefined,
      embedSpans: new Map(),
      rerankSpan: undefined,
      toolSpans: new Map(),
      settings,
      provider: event.provider,
      modelId: event.modelId,
    });
  }

  /** @deprecated */
  onObjectStepStart(event: ObjectOnStepStartEvent): void {
    const state = this.getCallState(event.callId);
    if (!state?.rootSpan || !state.rootContext) return;

    const { telemetry } = state;
    const providerName = mapProviderName(event.provider);

    const attributes = selectAttributes(telemetry, {
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': providerName,
      'gen_ai.request.model': event.modelId,
      'gen_ai.output.type': 'json',
      'gen_ai.request.frequency_penalty': state.settings.frequencyPenalty as
        | number
        | undefined,
      'gen_ai.request.max_tokens': state.settings.maxOutputTokens as
        | number
        | undefined,
      'gen_ai.request.presence_penalty': state.settings.presencePenalty as
        | number
        | undefined,
      'gen_ai.request.temperature': (state.settings.temperature ?? undefined) as
        | number
        | undefined,
      'gen_ai.request.top_k': state.settings.topK as number | undefined,
      'gen_ai.request.top_p': state.settings.topP as number | undefined,
      'gen_ai.input.messages': {
        input: () =>
          event.promptMessages
            ? JSON.stringify(formatInputMessages(event.promptMessages))
            : undefined,
      },
    });

    const spanName = `chat ${event.modelId}`;
    state.stepSpan = this.tracer.startSpan(
      spanName,
      { attributes, kind: SpanKind.CLIENT },
      state.rootContext,
    );
    state.stepContext = trace.setSpan(state.rootContext, state.stepSpan);
  }

  /** @deprecated */
  onObjectStepFinish(event: ObjectOnStepFinishEvent): void {
    const state = this.getCallState(event.callId);
    if (!state?.stepSpan) return;

    const { telemetry } = state;

    state.stepSpan.setAttributes(
      selectAttributes(telemetry, {
        'gen_ai.response.finish_reasons': [event.finishReason],
        'gen_ai.response.id': event.response.id,
        'gen_ai.response.model': event.response.modelId,
        'gen_ai.usage.input_tokens': event.usage.inputTokens,
        'gen_ai.usage.output_tokens': event.usage.outputTokens,
        'gen_ai.usage.cache_read.input_tokens': event.usage.cachedInputTokens,
        'gen_ai.output.messages': {
          output: () => {
            try {
              return JSON.stringify(
                formatObjectOutputMessages({
                  objectText: event.objectText,
                  finishReason: event.finishReason,
                }),
              );
            } catch {
              return event.objectText;
            }
          },
        },
      }),
    );

    state.stepSpan.end();
    state.stepSpan = undefined;
    state.stepContext = undefined;
  }

  private onEmbedOperationStart(event: EmbedOnStartEvent): void {
    const telemetry: TelemetryOptions = {
      isEnabled: event.isEnabled,
      recordInputs: event.recordInputs,
      recordOutputs: event.recordOutputs,
      functionId: event.functionId,
    };

    const settings: Record<string, unknown> = {
      maxRetries: event.maxRetries,
    };

    const providerName = mapProviderName(event.provider);

    const attributes = selectAttributes(telemetry, {
      'gen_ai.operation.name': 'embeddings',
      'gen_ai.provider.name': providerName,
      'gen_ai.request.model': event.modelId,
    });

    const spanName = `embeddings ${event.modelId}`;
    const rootSpan = this.tracer.startSpan(spanName, {
      attributes,
      kind: SpanKind.CLIENT,
    });
    const rootContext = trace.setSpan(context.active(), rootSpan);

    this.callStates.set(event.callId, {
      operationId: event.operationId,
      telemetry,
      rootSpan,
      rootContext,
      stepSpan: undefined,
      stepContext: undefined,
      embedSpans: new Map(),
      rerankSpan: undefined,
      toolSpans: new Map(),
      settings,
      provider: event.provider,
      modelId: event.modelId,
    });
  }

  onStepStart(event: OtelStepStartEvent): void {
    const state = this.getCallState(event.callId);
    if (!state?.rootSpan || !state.rootContext) return;

    const { telemetry } = state;
    const providerName = mapProviderName(event.provider);

    const attributes = selectAttributes(telemetry, {
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': providerName,
      'gen_ai.request.model': event.modelId,
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
      'gen_ai.request.temperature': (state.settings.temperature ?? undefined) as
        | number
        | undefined,
      'gen_ai.request.top_k': state.settings.topK as number | undefined,
      'gen_ai.request.top_p': state.settings.topP as number | undefined,
      'gen_ai.input.messages': {
        input: () =>
          event.promptMessages
            ? JSON.stringify(formatInputMessages(event.promptMessages))
            : undefined,
      },
      'gen_ai.tool.definitions': {
        input: () =>
          event.stepTools ? JSON.stringify(event.stepTools) : undefined,
      },
    });

    const spanName = `chat ${event.modelId}`;
    state.stepSpan = this.tracer.startSpan(
      spanName,
      { attributes, kind: SpanKind.CLIENT },
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
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.tool.name': toolCall.toolName,
      'gen_ai.tool.call.id': toolCall.toolCallId,
      'gen_ai.tool.type': 'function',
      'gen_ai.tool.call.arguments': {
        input: () => JSON.stringify(toolCall.input),
      },
    });

    const spanName = `execute_tool ${toolCall.toolName}`;
    const toolSpan = this.tracer.startSpan(
      spanName,
      { attributes, kind: SpanKind.INTERNAL },
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
            'gen_ai.tool.call.result': {
              output: () => JSON.stringify(event.output),
            },
          }),
        );
      } catch {
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
        'gen_ai.response.finish_reasons': [event.finishReason],
        'gen_ai.response.id': event.response.id,
        'gen_ai.response.model': event.response.modelId,
        'gen_ai.usage.input_tokens': event.usage.inputTokens,
        'gen_ai.usage.output_tokens': event.usage.outputTokens,
        'gen_ai.usage.cache_read.input_tokens':
          event.usage.inputTokenDetails?.cacheReadTokens ??
          event.usage.cachedInputTokens,
        'gen_ai.usage.cache_creation.input_tokens':
          event.usage.inputTokenDetails?.cacheWriteTokens,
        'gen_ai.output.messages': {
          output: () =>
            JSON.stringify(
              formatOutputMessages({
                text: event.text ?? undefined,
                reasoning: event.reasoning as ReadonlyArray<{ text?: string }>,
                toolCalls: event.toolCalls,
                files: event.files,
                finishReason: event.finishReason,
              }),
            ),
        },
      }),
    );

    state.stepSpan.end();
    state.stepSpan = undefined;
    state.stepContext = undefined;
  }

  onFinish(
    event:
      | OnFinishEvent<ToolSet>
      | ObjectOnFinishEvent<unknown>
      | EmbedOnFinishEvent
      | RerankOnFinishEvent,
  ): void {
    const state = this.getCallState(event.callId);
    if (!state?.rootSpan) return;

    if (
      state.operationId === 'ai.embed' ||
      state.operationId === 'ai.embedMany'
    ) {
      this.onEmbedOperationFinish(event as EmbedOnFinishEvent);
      return;
    }

    if (state.operationId === 'ai.rerank') {
      this.onRerankOperationFinish(event as RerankOnFinishEvent);
      return;
    }

    if (
      state.operationId === 'ai.generateObject' ||
      state.operationId === 'ai.streamObject'
    ) {
      this.onObjectOperationFinish(event as ObjectOnFinishEvent<unknown>);
      return;
    }

    this.onGenerateFinish(event as OnFinishEvent<ToolSet>);
  }

  private onGenerateFinish(event: OnFinishEvent<ToolSet>): void {
    const state = this.getCallState(event.callId);
    if (!state?.rootSpan) return;

    const { telemetry } = state;

    state.rootSpan.setAttributes(
      selectAttributes(telemetry, {
        'gen_ai.response.finish_reasons': [event.finishReason],
        'gen_ai.usage.input_tokens': event.totalUsage.inputTokens,
        'gen_ai.usage.output_tokens': event.totalUsage.outputTokens,
        'gen_ai.usage.cache_read.input_tokens':
          event.totalUsage.inputTokenDetails?.cacheReadTokens ??
          event.totalUsage.cachedInputTokens,
        'gen_ai.usage.cache_creation.input_tokens':
          event.totalUsage.inputTokenDetails?.cacheWriteTokens,
        'gen_ai.output.messages': {
          output: () =>
            JSON.stringify(
              formatOutputMessages({
                text: event.text ?? undefined,
                reasoning: event.reasoning as ReadonlyArray<{ text?: string }>,
                toolCalls: event.toolCalls,
                files: event.files,
                finishReason: event.finishReason,
              }),
            ),
        },
      }),
    );

    state.rootSpan.end();
    this.cleanupCallState(event.callId);
  }

  private onObjectOperationFinish(event: ObjectOnFinishEvent<unknown>): void {
    const state = this.getCallState(event.callId);
    if (!state?.rootSpan) return;

    const { telemetry } = state;

    state.rootSpan.setAttributes(
      selectAttributes(telemetry, {
        'gen_ai.response.finish_reasons': [event.finishReason],
        'gen_ai.usage.input_tokens': event.usage.inputTokens,
        'gen_ai.usage.output_tokens': event.usage.outputTokens,
        'gen_ai.usage.cache_read.input_tokens': event.usage.cachedInputTokens,
        'gen_ai.output.messages': {
          output: () =>
            event.object != null
              ? JSON.stringify(
                  formatObjectOutputMessages({
                    objectText: JSON.stringify(event.object),
                    finishReason: event.finishReason,
                  }),
                )
              : undefined,
        },
      }),
    );

    state.rootSpan.end();
    this.cleanupCallState(event.callId);
  }

  private onEmbedOperationFinish(event: EmbedOnFinishEvent): void {
    const state = this.getCallState(event.callId);
    if (!state?.rootSpan) return;

    const { telemetry } = state;

    state.rootSpan.setAttributes(
      selectAttributes(telemetry, {
        'gen_ai.usage.input_tokens': event.usage.tokens,
      }),
    );

    state.rootSpan.end();
    this.cleanupCallState(event.callId);
  }

  onEmbedStart(event: EmbedStartEvent): void {
    const state = this.getCallState(event.callId);
    if (!state?.rootSpan || !state.rootContext) return;

    const { telemetry } = state;
    const providerName = mapProviderName(state.provider);

    const attributes = selectAttributes(telemetry, {
      'gen_ai.operation.name': 'embeddings',
      'gen_ai.provider.name': providerName,
      'gen_ai.request.model': state.modelId,
    });

    const spanName = `embeddings ${state.modelId}`;
    const embedSpan = this.tracer.startSpan(
      spanName,
      { attributes, kind: SpanKind.CLIENT },
      state.rootContext,
    );
    const embedContext = trace.setSpan(state.rootContext, embedSpan);

    state.embedSpans.set(event.embedCallId, {
      span: embedSpan,
      context: embedContext,
    });
  }

  onEmbedFinish(event: EmbedFinishEvent): void {
    const state = this.getCallState(event.callId);
    if (!state) return;

    const embedSpanEntry = state.embedSpans.get(event.embedCallId);
    if (!embedSpanEntry) return;

    const { span } = embedSpanEntry;
    const { telemetry } = state;

    span.setAttributes(
      selectAttributes(telemetry, {
        'gen_ai.usage.input_tokens': event.usage.tokens,
      }),
    );

    span.end();
    state.embedSpans.delete(event.embedCallId);
  }

  private onRerankOperationStart(event: RerankOnStartEvent): void {
    const telemetry: TelemetryOptions = {
      isEnabled: event.isEnabled,
      recordInputs: event.recordInputs,
      recordOutputs: event.recordOutputs,
      functionId: event.functionId,
    };

    const settings: Record<string, unknown> = {
      maxRetries: event.maxRetries,
    };

    const providerName = mapProviderName(event.provider);

    const attributes = selectAttributes(telemetry, {
      'gen_ai.operation.name': 'rerank',
      'gen_ai.provider.name': providerName,
      'gen_ai.request.model': event.modelId,
    });

    const spanName = `rerank ${event.modelId}`;
    const rootSpan = this.tracer.startSpan(spanName, {
      attributes,
      kind: SpanKind.CLIENT,
    });
    const rootContext = trace.setSpan(context.active(), rootSpan);

    this.callStates.set(event.callId, {
      operationId: event.operationId,
      telemetry,
      rootSpan,
      rootContext,
      stepSpan: undefined,
      stepContext: undefined,
      embedSpans: new Map(),
      rerankSpan: undefined,
      toolSpans: new Map(),
      settings,
      provider: event.provider,
      modelId: event.modelId,
    });
  }

  private onRerankOperationFinish(event: RerankOnFinishEvent): void {
    const state = this.getCallState(event.callId);
    if (!state?.rootSpan) return;

    state.rootSpan.end();
    this.cleanupCallState(event.callId);
  }

  onRerankStart(event: RerankStartEvent): void {
    const state = this.getCallState(event.callId);
    if (!state?.rootSpan || !state.rootContext) return;

    const { telemetry } = state;
    const providerName = mapProviderName(state.provider);

    const attributes = selectAttributes(telemetry, {
      'gen_ai.operation.name': 'rerank',
      'gen_ai.provider.name': providerName,
      'gen_ai.request.model': state.modelId,
    });

    const spanName = `rerank ${state.modelId}`;
    const rerankSpan = this.tracer.startSpan(
      spanName,
      { attributes, kind: SpanKind.CLIENT },
      state.rootContext,
    );
    const rerankContext = trace.setSpan(state.rootContext, rerankSpan);

    state.rerankSpan = { span: rerankSpan, context: rerankContext };
  }

  onRerankFinish(event: RerankFinishEvent): void {
    const state = this.getCallState(event.callId);
    if (!state?.rerankSpan) return;

    const { span } = state.rerankSpan;

    span.end();
    state.rerankSpan = undefined;
  }

  onChunk(_event: OnChunkEvent<ToolSet>): void {
    // No-op: streaming chunk events are not part of the GenAI SemConv.
  }

  onError(error: unknown): void {
    const event = error as { callId?: string; error?: unknown };
    if (!event?.callId) return;

    const state = this.getCallState(event.callId);
    if (!state?.rootSpan) return;

    const actualError = event.error ?? error;

    if (state.stepSpan) {
      recordSpanError(state.stepSpan, actualError);
      state.stepSpan.end();
    }

    for (const { span: embedSpan } of state.embedSpans.values()) {
      recordSpanError(embedSpan, actualError);
      embedSpan.end();
    }
    state.embedSpans.clear();

    if (state.rerankSpan) {
      recordSpanError(state.rerankSpan.span, actualError);
      state.rerankSpan.span.end();
      state.rerankSpan = undefined;
    }

    recordSpanError(state.rootSpan, actualError);

    state.rootSpan.end();
    this.cleanupCallState(event.callId);
  }
}
