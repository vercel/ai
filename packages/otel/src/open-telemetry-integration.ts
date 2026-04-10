import { LanguageModelV4Prompt } from '@ai-sdk/provider';
import {
  Attributes,
  AttributeValue,
  context,
  Context,
  Span,
  SpanStatusCode,
  trace,
  Tracer,
} from '@opentelemetry/api';
import type {
  EmbedFinishEvent,
  EmbedOnFinishEvent,
  EmbedOnStartEvent,
  EmbedStartEvent,
  GenerationContext,
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
  TelemetryIntegration,
  TelemetrySettings,
  ToolSet,
} from 'ai';
import { assembleOperationName } from './assemble-operation-name';
import { getBaseTelemetryAttributes } from './get-base-telemetry-attributes';
import { stringifyForTelemetry } from './stringify-for-telemetry';

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

    const baseTelemetryAttributes = getBaseTelemetryAttributes({
      model: { provider: event.provider, modelId: event.modelId },
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
      'ai.model.provider': event.provider,
      'ai.model.id': event.modelId,
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
      embedSpans: new Map(),
      rerankSpan: undefined,
      toolSpans: new Map(),
      baseTelemetryAttributes,
      settings,
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

    const baseTelemetryAttributes = getBaseTelemetryAttributes({
      model: { provider: event.provider, modelId: event.modelId },
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
      'ai.prompt': {
        input: () =>
          JSON.stringify({
            system: event.system,
            prompt: event.prompt,
            messages: event.messages,
          }),
      },
      'ai.schema': event.schema
        ? { input: () => JSON.stringify(event.schema) }
        : undefined,
      'ai.schema.name': event.schemaName,
      'ai.schema.description': event.schemaDescription,
      'ai.settings.output': event.output,
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
      embedSpans: new Map(),
      rerankSpan: undefined,
      toolSpans: new Map(),
      baseTelemetryAttributes,
      settings,
    });
  }

  /** @deprecated */
  onObjectStepStart(event: ObjectOnStepStartEvent): void {
    const state = this.getCallState(event.callId);
    if (!state?.rootSpan || !state.rootContext) return;

    const { telemetry } = state;

    const stepOperationId =
      state.operationId === 'ai.streamObject'
        ? 'ai.streamObject.doStream'
        : 'ai.generateObject.doGenerate';

    const attributes = selectAttributes(telemetry, {
      ...assembleOperationName({
        operationId: stepOperationId,
        telemetry,
      }),
      ...state.baseTelemetryAttributes,
      'ai.prompt.messages': {
        input: () =>
          event.promptMessages
            ? stringifyForTelemetry(event.promptMessages)
            : undefined,
      },

      'gen_ai.system': event.provider,
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
      'gen_ai.request.temperature': (state.settings.temperature ?? undefined) as
        | number
        | undefined,
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

  /** @deprecated */
  onObjectStepFinish(event: ObjectOnStepFinishEvent): void {
    const state = this.getCallState(event.callId);
    if (!state?.stepSpan) return;

    const { telemetry } = state;

    state.stepSpan.setAttributes(
      selectAttributes(telemetry, {
        'ai.response.finishReason': event.finishReason,
        'ai.response.object': {
          output: () => {
            try {
              return JSON.stringify(JSON.parse(event.objectText));
            } catch {
              return event.objectText;
            }
          },
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

        'gen_ai.response.finish_reasons': [event.finishReason],
        'gen_ai.response.id': event.response.id,
        'gen_ai.response.model': event.response.modelId,
        'gen_ai.usage.input_tokens': event.usage.inputTokens,
        'gen_ai.usage.output_tokens': event.usage.outputTokens,
      }),
    );

    if (event.msToFirstChunk != null) {
      state.stepSpan.addEvent('ai.stream.firstChunk', {
        'ai.stream.msToFirstChunk': event.msToFirstChunk,
      });
      state.stepSpan.setAttributes({
        'ai.stream.msToFirstChunk': event.msToFirstChunk,
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

    const baseTelemetryAttributes = getBaseTelemetryAttributes({
      model: { provider: event.provider, modelId: event.modelId },
      telemetry,
      headers: event.headers,
      settings,
    });

    const value = event.value;
    const isMany = event.operationId === 'ai.embedMany';

    const attributes = selectAttributes(telemetry, {
      ...assembleOperationName({
        operationId: event.operationId,
        telemetry,
      }),
      ...baseTelemetryAttributes,
      ...(isMany
        ? {
            'ai.values': {
              input: () => (value as string[]).map(v => JSON.stringify(v)),
            },
          }
        : {
            'ai.value': {
              input: () => JSON.stringify(value),
            },
          }),
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
      embedSpans: new Map(),
      rerankSpan: undefined,
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
      'ai.model.provider': event.provider,
      'ai.model.id': event.modelId,

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

      'gen_ai.system': event.provider,
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
        'ai.response.files': {
          output: () =>
            event.files.length > 0
              ? JSON.stringify(
                  event.files.map(file => ({
                    type: 'file',
                    mediaType: file.mediaType,
                    data: file.base64,
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
        'ai.response.files': {
          output: () =>
            event.files.length > 0
              ? JSON.stringify(
                  event.files.map(file => ({
                    type: 'file',
                    mediaType: file.mediaType,
                    data: file.base64,
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

  private onObjectOperationFinish(event: ObjectOnFinishEvent<unknown>): void {
    const state = this.getCallState(event.callId);
    if (!state?.rootSpan) return;

    const { telemetry } = state;

    state.rootSpan.setAttributes(
      selectAttributes(telemetry, {
        'ai.response.finishReason': event.finishReason,
        'ai.response.object': {
          output: () =>
            event.object != null ? JSON.stringify(event.object) : undefined,
        },
        'ai.response.providerMetadata': event.providerMetadata
          ? JSON.stringify(event.providerMetadata)
          : undefined,

        'ai.usage.inputTokens': event.usage.inputTokens,
        'ai.usage.outputTokens': event.usage.outputTokens,
        'ai.usage.totalTokens': event.usage.totalTokens,
        'ai.usage.reasoningTokens': event.usage.reasoningTokens,
        'ai.usage.cachedInputTokens': event.usage.cachedInputTokens,
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
        ...(isMany
          ? {
              'ai.embeddings': {
                output: () =>
                  (event.embedding as number[][]).map(e => JSON.stringify(e)),
              },
            }
          : {
              'ai.embedding': {
                output: () => JSON.stringify(event.embedding),
              },
            }),
        'ai.usage.tokens': event.usage.tokens,
      }),
    );

    state.rootSpan.end();
    this.cleanupCallState(event.callId);
  }

  onEmbedStart(event: EmbedStartEvent): void {
    const state = this.getCallState(event.callId);
    if (!state?.rootSpan || !state.rootContext) return;

    const { telemetry } = state;

    const attributes = selectAttributes(telemetry, {
      ...assembleOperationName({
        operationId: event.operationId,
        telemetry,
      }),
      ...state.baseTelemetryAttributes,
      'ai.values': {
        input: () => event.values.map(v => JSON.stringify(v)),
      },
    });

    const embedSpan = this.tracer.startSpan(
      event.operationId,
      { attributes },
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
        'ai.embeddings': {
          output: () =>
            event.embeddings.map(embedding => JSON.stringify(embedding)),
        },
        'ai.usage.tokens': event.usage.tokens,
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

    const baseTelemetryAttributes = getBaseTelemetryAttributes({
      model: { provider: event.provider, modelId: event.modelId },
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
      'ai.documents': {
        input: () => event.documents.map(d => JSON.stringify(d)),
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
      embedSpans: new Map(),
      rerankSpan: undefined,
      toolSpans: new Map(),
      baseTelemetryAttributes,
      settings,
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

    const attributes = selectAttributes(telemetry, {
      ...assembleOperationName({
        operationId: event.operationId,
        telemetry,
      }),
      ...state.baseTelemetryAttributes,
      'ai.documents': {
        input: () => event.documents.map(d => JSON.stringify(d)),
      },
    });

    const rerankSpan = this.tracer.startSpan(
      event.operationId,
      { attributes },
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
        'ai.ranking.type': event.documentsType,
        'ai.ranking': {
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
