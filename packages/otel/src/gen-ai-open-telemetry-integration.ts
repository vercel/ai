import { LanguageModelV4Prompt } from '@ai-sdk/provider';
import {
  context,
  trace,
  Span,
  Context,
  Attributes,
  AttributeValue,
  SpanStatusCode,
  SpanKind,
  Tracer,
} from '@opentelemetry/api';
import type {
  EmbedOnStartEvent,
  EmbedOnFinishEvent,
  EmbedStartEvent,
  EmbedFinishEvent,
  GenerationContext,
  RerankOnStartEvent,
  RerankOnFinishEvent,
  RerankStartEvent,
  RerankFinishEvent,
  OnChunkEvent,
  OnFinishEvent,
  OnStartEvent,
  OnStepFinishEvent,
  OnStepStartEvent,
  OnToolCallFinishEvent,
  OnToolCallStartEvent,
  ObjectOnStartEvent,
  ObjectOnFinishEvent,
  ObjectOnStepStartEvent,
  ObjectOnStepFinishEvent,
  TelemetryIntegration,
  TelemetrySettings,
  ToolSet,
} from 'ai';
import type { OutputInterface as Output } from 'ai';
import {
  extractSystemFromPrompt,
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
  CONTEXT extends GenerationContext<TOOLS> = GenerationContext<TOOLS>,
  OUTPUT extends Output = Output,
> extends OnStepStartEvent<TOOLS, CONTEXT, OUTPUT> {
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
  embedSpans: Map<string, { span: Span; context: Context }>;
  rerankSpan: { span: Span; context: Context } | undefined;
  toolSpans: Map<string, { span: Span; context: Context }>;
  settings: Record<string, unknown>;
  provider: string;
  modelId: string;
}

export class GenAIOpenTelemetryIntegration implements TelemetryIntegration {
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
      | OnStartEvent<ToolSet, Output>
      | ObjectOnStartEvent
      | EmbedOnStartEvent
      | RerankOnStartEvent,
  ): void {
    if (event.isEnabled !== true) return;

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

    this.onGenerateStart(event as OnStartEvent<ToolSet, Output>);
  }

  private onGenerateStart(event: OnStartEvent<ToolSet, Output>): void {
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
      'gen_ai.ai_sdk.telemetry.function_id': telemetry.functionId,
      ...metadataAttributes(telemetry),
      ...settingsAttributes(settings),
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
      'gen_ai.ai_sdk.schema': event.schema
        ? { input: () => JSON.stringify(event.schema) }
        : undefined,
      'gen_ai.ai_sdk.schema.name': event.schemaName,
      'gen_ai.ai_sdk.schema.description': event.schemaDescription,
      'gen_ai.ai_sdk.settings.output': event.output,
      'gen_ai.ai_sdk.telemetry.function_id': telemetry.functionId,
      ...metadataAttributes(telemetry),
      ...settingsAttributes(settings),
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
        'gen_ai.ai_sdk.usage.reasoning_tokens': event.usage.reasoningTokens,
        'gen_ai.ai_sdk.usage.total_tokens': event.usage.totalTokens,
        'gen_ai.ai_sdk.response.timestamp':
          event.response.timestamp.toISOString(),
        'gen_ai.ai_sdk.response.provider_metadata': event.providerMetadata
          ? JSON.stringify(event.providerMetadata)
          : undefined,
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

    if (event.msToFirstChunk != null) {
      state.stepSpan.addEvent('gen_ai.ai_sdk.stream.first_chunk', {
        'gen_ai.ai_sdk.stream.ms_to_first_chunk': event.msToFirstChunk,
      });
      state.stepSpan.setAttributes({
        'gen_ai.ai_sdk.stream.ms_to_first_chunk': event.msToFirstChunk,
      });
    }

    state.stepSpan.end();
    state.stepSpan = undefined;
    state.stepContext = undefined;
  }

  private onEmbedOperationStart(event: EmbedOnStartEvent): void {
    const telemetry: TelemetrySettings = {
      isEnabled: event.isEnabled,
      recordInputs: event.recordInputs,
      recordOutputs: event.recordOutputs,
      functionId: event.functionId,
      metadata: event.metadata,
    };

    const settings: Record<string, unknown> = {
      maxRetries: event.maxRetries,
    };

    const providerName = mapProviderName(event.provider);
    const isMany = event.operationId === 'ai.embedMany';

    const attributes = selectAttributes(telemetry, {
      'gen_ai.operation.name': 'embeddings',
      'gen_ai.provider.name': providerName,
      'gen_ai.request.model': event.modelId,
      'gen_ai.ai_sdk.telemetry.function_id': telemetry.functionId,
      ...metadataAttributes(telemetry),
      ...settingsAttributes(settings),
      ...(isMany
        ? {
            'gen_ai.ai_sdk.values': {
              input: () =>
                (event.value as string[]).map(v => JSON.stringify(v)),
            },
          }
        : {
            'gen_ai.ai_sdk.value': {
              input: () => JSON.stringify(event.value),
            },
          }),
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

  onStepStart(event: OtelStepStartEvent<ToolSet, Output>): void {
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
        'gen_ai.ai_sdk.usage.reasoning_tokens': event.usage.reasoningTokens,
        'gen_ai.ai_sdk.usage.total_tokens': event.usage.totalTokens,
        'gen_ai.ai_sdk.usage.input_token_details.no_cache_tokens':
          event.usage.inputTokenDetails?.noCacheTokens,
        'gen_ai.ai_sdk.usage.output_token_details.text_tokens':
          event.usage.outputTokenDetails?.textTokens,
        'gen_ai.ai_sdk.usage.output_token_details.reasoning_tokens':
          event.usage.outputTokenDetails?.reasoningTokens,
        'gen_ai.ai_sdk.response.timestamp':
          event.response.timestamp.toISOString(),
        'gen_ai.ai_sdk.response.provider_metadata': event.providerMetadata
          ? JSON.stringify(event.providerMetadata)
          : undefined,
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
        'gen_ai.ai_sdk.usage.reasoning_tokens':
          event.totalUsage.reasoningTokens,
        'gen_ai.ai_sdk.usage.total_tokens': event.totalUsage.totalTokens,
        'gen_ai.ai_sdk.usage.input_token_details.no_cache_tokens':
          event.totalUsage.inputTokenDetails?.noCacheTokens,
        'gen_ai.ai_sdk.usage.output_token_details.text_tokens':
          event.totalUsage.outputTokenDetails?.textTokens,
        'gen_ai.ai_sdk.usage.output_token_details.reasoning_tokens':
          event.totalUsage.outputTokenDetails?.reasoningTokens,
        'gen_ai.ai_sdk.response.provider_metadata': event.providerMetadata
          ? JSON.stringify(event.providerMetadata)
          : undefined,
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
        'gen_ai.ai_sdk.usage.reasoning_tokens': event.usage.reasoningTokens,
        'gen_ai.ai_sdk.usage.total_tokens': event.usage.totalTokens,
        'gen_ai.ai_sdk.response.provider_metadata': event.providerMetadata
          ? JSON.stringify(event.providerMetadata)
          : undefined,
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
    const isMany = state.operationId === 'ai.embedMany';

    state.rootSpan.setAttributes(
      selectAttributes(telemetry, {
        'gen_ai.usage.input_tokens': event.usage.tokens,
        ...(isMany
          ? {
              'gen_ai.ai_sdk.embeddings': {
                output: () =>
                  (event.embedding as number[][]).map(e => JSON.stringify(e)),
              },
            }
          : {
              'gen_ai.ai_sdk.embedding': {
                output: () => JSON.stringify(event.embedding),
              },
            }),
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
      'gen_ai.ai_sdk.values': {
        input: () => event.values.map(v => JSON.stringify(v)),
      },
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
        'gen_ai.ai_sdk.embeddings': {
          output: () =>
            event.embeddings.map(embedding => JSON.stringify(embedding)),
        },
        'gen_ai.usage.input_tokens': event.usage.tokens,
      }),
    );

    span.end();
    state.embedSpans.delete(event.embedCallId);
  }

  private onRerankOperationStart(event: RerankOnStartEvent): void {
    const telemetry: TelemetrySettings = {
      isEnabled: event.isEnabled,
      recordInputs: event.recordInputs,
      recordOutputs: event.recordOutputs,
      functionId: event.functionId,
      metadata: event.metadata,
    };

    const settings: Record<string, unknown> = {
      maxRetries: event.maxRetries,
    };

    const providerName = mapProviderName(event.provider);

    const attributes = selectAttributes(telemetry, {
      'gen_ai.operation.name': 'rerank',
      'gen_ai.provider.name': providerName,
      'gen_ai.request.model': event.modelId,
      'gen_ai.ai_sdk.telemetry.function_id': telemetry.functionId,
      ...metadataAttributes(telemetry),
      ...settingsAttributes(settings),
      'gen_ai.ai_sdk.documents': {
        input: () => event.documents.map(d => JSON.stringify(d)),
      },
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
      'gen_ai.ai_sdk.documents': {
        input: () => event.documents.map(d => JSON.stringify(d)),
      },
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
    const { telemetry } = state;

    span.setAttributes(
      selectAttributes(telemetry, {
        'gen_ai.ai_sdk.ranking.type': event.documentsType,
        'gen_ai.ai_sdk.ranking': {
          output: () => event.ranking.map(r => JSON.stringify(r)),
        },
      }),
    );

    span.end();
    state.rerankSpan = undefined;
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

    const rawAttributes = Object.fromEntries(
      Object.entries(
        (chunk.attributes as Record<string, unknown>) ?? {},
      ).filter(([, value]) => value != null),
    ) as Attributes;

    const genAiEventName =
      chunk.type === 'ai.stream.firstChunk'
        ? 'gen_ai.ai_sdk.stream.first_chunk'
        : 'gen_ai.ai_sdk.stream.finish';

    const genAiAttributes: Attributes = {};
    for (const [key, value] of Object.entries(rawAttributes)) {
      const mappedKey = key.replace(/^ai\./, 'gen_ai.ai_sdk.');
      genAiAttributes[mappedKey] = value;
    }

    state.stepSpan.addEvent(genAiEventName, genAiAttributes);
    if (Object.keys(genAiAttributes).length > 0) {
      state.stepSpan.setAttributes(genAiAttributes);
    }
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

function metadataAttributes(
  telemetry: TelemetrySettings | undefined,
): Record<string, AttributeValue | undefined> {
  if (!telemetry?.metadata) return {};
  const result: Record<string, AttributeValue | undefined> = {};
  for (const [key, value] of Object.entries(telemetry.metadata)) {
    if (value != null) {
      result[`gen_ai.ai_sdk.telemetry.metadata.${key}`] =
        value as AttributeValue;
    }
  }
  return result;
}

function settingsAttributes(
  settings: Record<string, unknown>,
): Record<string, AttributeValue | undefined> {
  const result: Record<string, AttributeValue | undefined> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (value != null) {
      result[`gen_ai.ai_sdk.settings.${key}`] = value as AttributeValue;
    }
  }
  return result;
}
