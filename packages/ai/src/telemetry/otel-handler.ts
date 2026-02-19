import { Span, context, trace } from '@opentelemetry/api';
import { assembleOperationName } from './assemble-operation-name';
import { getTracer } from './get-tracer';
import { recordErrorOnSpan } from './record-span';
import { selectTelemetryAttributes } from './select-telemetry-attributes';
import { stringifyForTelemetry } from './stringify-for-telemetry';
import { TelemetryHandler, TelemetryOnStartEvent } from './telemetry-handler';
import { TelemetrySettings } from './telemetry-settings';

export function createOtelHandler({
  telemetry,
}: {
  telemetry: TelemetrySettings;
}): TelemetryHandler {
  const tracer = getTracer(telemetry);

  let rootSpan: Span | undefined;
  let rootCtx = context.active();

  const stepSpans = new Map<number, Span>();
  const stepContexts = new Map<number, typeof rootCtx>();
  const toolCallSpans = new Map<string, Span>();

  let currentStepNumber = -1;

  let storedSettings: TelemetryOnStartEvent['settings'] | undefined;

  return {
    async onStart(event) {
      storedSettings = event.settings;

      const attributes = await selectTelemetryAttributes({
        telemetry,
        attributes: {
          ...assembleOperationName({
            operationId: 'ai.generateText',
            telemetry,
          }),
          'ai.model.provider': event.model.provider,
          'ai.model.id': event.model.modelId,

          'ai.settings.maxOutputTokens': event.settings.maxOutputTokens,
          'ai.settings.topP': event.settings.topP,
          'ai.settings.topK': event.settings.topK,
          'ai.settings.presencePenalty': event.settings.presencePenalty,
          'ai.settings.frequencyPenalty': event.settings.frequencyPenalty,
          'ai.settings.stopSequences': event.settings.stopSequences,
          'ai.settings.seed': event.settings.seed,
          'ai.settings.maxRetries': event.settings.maxRetries,

          ...Object.entries(telemetry?.metadata ?? {}).reduce(
            (attrs, [key, value]) => {
              attrs[`ai.telemetry.metadata.${key}`] =
                value as import('@opentelemetry/api').AttributeValue;
              return attrs;
            },
            {} as import('@opentelemetry/api').Attributes,
          ),

          'ai.prompt': {
            input: () =>
              JSON.stringify({
                system: event.system,
                prompt: event.prompt,
                messages: event.messages,
              }),
          },
        },
      });

      rootSpan = tracer.startSpan('ai.generateText', { attributes });
      rootCtx = trace.setSpan(context.active(), rootSpan);
    },

    async onStepStart(event) {
      currentStepNumber = event.stepNumber;

      const attributes = await selectTelemetryAttributes({
        telemetry,
        attributes: {
          ...assembleOperationName({
            operationId: 'ai.generateText.doGenerate',
            telemetry,
          }),
          'ai.model.provider': event.model.provider,
          'ai.model.id': event.model.modelId,

          'ai.settings.maxOutputTokens': storedSettings?.maxOutputTokens,
          'ai.settings.topP': storedSettings?.topP,
          'ai.settings.topK': storedSettings?.topK,
          'ai.settings.presencePenalty': storedSettings?.presencePenalty,
          'ai.settings.frequencyPenalty': storedSettings?.frequencyPenalty,
          'ai.settings.stopSequences': storedSettings?.stopSequences,
          'ai.settings.seed': storedSettings?.seed,
          'ai.settings.maxRetries': storedSettings?.maxRetries,

          ...Object.entries(telemetry?.metadata ?? {}).reduce(
            (attrs, [key, value]) => {
              attrs[`ai.telemetry.metadata.${key}`] =
                value as import('@opentelemetry/api').AttributeValue;
              return attrs;
            },
            {} as import('@opentelemetry/api').Attributes,
          ),

          'ai.prompt.messages': {
            input: () => stringifyForTelemetry(event.promptMessages),
          },
          'ai.prompt.tools': {
            input: () => {
              if (event.tools == null) return undefined;
              return Object.values(event.tools).map(tool =>
                JSON.stringify(tool),
              );
            },
          },
          'ai.prompt.toolChoice': {
            input: () =>
              event.toolChoice != null
                ? JSON.stringify(event.toolChoice)
                : undefined,
          },

          'gen_ai.system': event.model.provider,
          'gen_ai.request.model': event.model.modelId,
          'gen_ai.request.frequency_penalty': storedSettings?.frequencyPenalty,
          'gen_ai.request.max_tokens': storedSettings?.maxOutputTokens,
          'gen_ai.request.presence_penalty': storedSettings?.presencePenalty,
          'gen_ai.request.stop_sequences': storedSettings?.stopSequences,
          'gen_ai.request.temperature':
            storedSettings?.temperature ?? undefined,
          'gen_ai.request.top_k': storedSettings?.topK,
          'gen_ai.request.top_p': storedSettings?.topP,
        },
      });

      const stepSpan = tracer.startSpan(
        'ai.generateText.doGenerate',
        { attributes },
        rootCtx,
      );
      const stepCtx = trace.setSpan(rootCtx, stepSpan);

      stepSpans.set(event.stepNumber, stepSpan);
      stepContexts.set(event.stepNumber, stepCtx);
    },

    async onStepFinish(event) {
      const stepSpan = stepSpans.get(event.stepNumber);
      if (stepSpan == null) return;

      const toolCallsForTelemetry =
        event.toolCalls.length === 0
          ? undefined
          : JSON.stringify(
              event.toolCalls.map(tc => ({
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                input: tc.input,
              })),
            );

      stepSpan.setAttributes(
        await selectTelemetryAttributes({
          telemetry,
          attributes: {
            'ai.response.finishReason': event.finishReason,
            'ai.response.text': { output: () => event.text || undefined },
            'ai.response.reasoning': {
              output: () => event.reasoningText,
            },
            'ai.response.toolCalls': {
              output: () => toolCallsForTelemetry,
            },
            'ai.response.id': event.response.id,
            'ai.response.model': event.response.modelId,
            'ai.response.timestamp': event.response.timestamp.toISOString(),
            'ai.response.providerMetadata': JSON.stringify(
              event.providerMetadata,
            ),

            'ai.usage.promptTokens': event.usage.inputTokens,
            'ai.usage.completionTokens': event.usage.outputTokens,
            'ai.usage.inputTokens': event.usage.inputTokens,
            'ai.usage.outputTokens': event.usage.outputTokens,
            'ai.usage.totalTokens': event.usage.totalTokens,
            'ai.usage.reasoningTokens':
              event.usage.outputTokenDetails?.reasoningTokens,
            'ai.usage.cachedInputTokens':
              event.usage.inputTokenDetails?.cacheReadTokens,

            'gen_ai.response.finish_reasons': [event.finishReason],
            'gen_ai.response.id': event.response.id,
            'gen_ai.response.model': event.response.modelId,
            'gen_ai.usage.input_tokens': event.usage.inputTokens,
            'gen_ai.usage.output_tokens': event.usage.outputTokens,
          },
        }),
      );

      stepSpan.end();
      stepSpans.delete(event.stepNumber);
      stepContexts.delete(event.stepNumber);
    },

    async onToolCallStart(event) {
      const parentCtx = stepContexts.get(currentStepNumber) ?? rootCtx;

      const attributes = await selectTelemetryAttributes({
        telemetry,
        attributes: {
          ...assembleOperationName({
            operationId: 'ai.toolCall',
            telemetry,
          }),
          'ai.toolCall.name': event.toolName,
          'ai.toolCall.id': event.toolCallId,
          'ai.toolCall.args': {
            output: () => JSON.stringify(event.input),
          },
        },
      });

      const toolSpan = tracer.startSpan(
        'ai.toolCall',
        { attributes },
        parentCtx,
      );
      toolCallSpans.set(event.toolCallId, toolSpan);
    },

    async onToolCallFinish(event) {
      const toolSpan = toolCallSpans.get(event.toolCallId);
      if (toolSpan == null) return;

      if (event.error != null) {
        recordErrorOnSpan(toolSpan, event.error);
      } else {
        try {
          toolSpan.setAttributes(
            await selectTelemetryAttributes({
              telemetry,
              attributes: {
                'ai.toolCall.result': {
                  output: () => JSON.stringify(event.output),
                },
              },
            }),
          );
        } catch (_ignored) {
          // JSON.stringify may fail for non-serializable results
        }
      }

      toolSpan.end();
      toolCallSpans.delete(event.toolCallId);
    },

    async onFinish(event) {
      if (rootSpan == null) return;

      const toolCallsForTelemetry =
        event.toolCalls.length === 0
          ? undefined
          : JSON.stringify(
              event.toolCalls.map(tc => ({
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                input: tc.input,
              })),
            );

      rootSpan.setAttributes(
        await selectTelemetryAttributes({
          telemetry,
          attributes: {
            'ai.response.finishReason': event.finishReason,
            'ai.response.text': { output: () => event.text || undefined },
            'ai.response.reasoning': {
              output: () => event.reasoningText,
            },
            'ai.response.toolCalls': {
              output: () => toolCallsForTelemetry,
            },
            'ai.response.providerMetadata': JSON.stringify(
              event.providerMetadata,
            ),

            'ai.usage.promptTokens': event.totalUsage.inputTokens,
            'ai.usage.completionTokens': event.totalUsage.outputTokens,
            'ai.usage.inputTokens': event.totalUsage.inputTokens,
            'ai.usage.outputTokens': event.totalUsage.outputTokens,
            'ai.usage.totalTokens': event.totalUsage.totalTokens,
            'ai.usage.reasoningTokens':
              event.totalUsage.outputTokenDetails?.reasoningTokens,
            'ai.usage.cachedInputTokens':
              event.totalUsage.inputTokenDetails?.cacheReadTokens,
          },
        }),
      );

      rootSpan.end();
      rootSpan = undefined;
    },
  };
}
