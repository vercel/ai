import {
  LanguageModelV3FunctionTool,
  LanguageModelV3Prompt,
  LanguageModelV3ProviderTool,
  LanguageModelV3ToolChoice,
} from '@ai-sdk/provider';
import {
  context,
  trace,
  Span,
  Context,
  Tracer,
  Attributes,
  AttributeValue,
  SpanStatusCode,
} from '@opentelemetry/api';
import { listenOnStart } from '../events/on-start';
import { listenOnStepFinish } from '../events/on-step-finish';
import { listenOnStepStart } from '../events/on-step-start';
import { listenOnToolCallFinish } from '../events/on-tool-call-finish';
import { listenOnToolCallStart } from '../events/on-tool-call-start';
import { listenOnFinish } from '../events/on-finish';
import { assembleOperationName } from './assemble-operation-name';
import { getBaseTelemetryAttributes } from './get-base-telemetry-attributes';
import { getTracer } from './get-tracer';
import { stringifyForTelemetry } from './stringify-for-telemetry';
import { TelemetrySettings } from './telemetry-settings';

interface StepPromptData {
  promptMessages: LanguageModelV3Prompt;
  tools:
    | Array<LanguageModelV3FunctionTool | LanguageModelV3ProviderTool>
    | undefined;
  toolChoice: LanguageModelV3ToolChoice | undefined;
}

interface CallTelemetryState {
  tracer: Tracer;
  telemetry: TelemetrySettings | undefined;
  rootSpan: Span;
  rootContext: Context;
  stepSpan?: Span;
  stepContext?: Context;
  toolSpans: Map<string, { span: Span; context: Context }>;
  baseTelemetryAttributes: Attributes;
  settings: Record<string, unknown>;
  pendingStepPromptData?: StepPromptData;
}

const callStates = new Map<string, CallTelemetryState>();

/**
 * Registers a callId for OTel event-based span management.
 * Call this from generateText/streamText before firing onStart.
 * Only calls registered here will have spans created by the event handler,
 * avoiding double-spanning with functions that still use inline recordSpan.
 */
export function registerOtelCall(
  callId: string,
  telemetry: TelemetrySettings | undefined,
): void {
  const tracer = getTracer(telemetry);

  callStates.set(callId, {
    tracer,
    telemetry,
    rootSpan: undefined as any, // set in onStart
    rootContext: undefined as any, // set in onStart
    toolSpans: new Map(),
    baseTelemetryAttributes: {},
    settings: {},
  });
}

/**
 * Stores LLM-level prompt data for the next step span.
 * Call this from generateText/streamText after converting the prompt
 * but before firing onStepStart, so the handler can include
 * ai.prompt.messages, ai.prompt.tools, and ai.prompt.toolChoice.
 */
export function setStepPromptData(callId: string, data: StepPromptData): void {
  const state = callStates.get(callId);
  if (state) {
    state.pendingStepPromptData = data;
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

function setupListeners() {
  listenOnStart(event => {
    const state = callStates.get(event.callId);
    if (!state) return;

    const { tracer, telemetry } = state;

    const settings = {
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

    state.baseTelemetryAttributes = baseTelemetryAttributes;
    state.settings = settings;

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

    state.rootSpan = rootSpan;
    state.rootContext = rootContext;
  });

  listenOnStepStart(event => {
    const state = callStates.get(event.callId);
    if (!state?.rootSpan) return;

    const {
      tracer,
      telemetry,
      baseTelemetryAttributes,
      rootContext,
      settings,
      pendingStepPromptData,
    } = state;

    // Clear the pending data so it's not reused by a subsequent step
    state.pendingStepPromptData = undefined;

    const attributes = selectAttributes(telemetry, {
      ...assembleOperationName({
        operationId: 'ai.generateText.doGenerate',
        telemetry,
      }),
      ...baseTelemetryAttributes,
      'ai.model.provider': event.model.provider,
      'ai.model.id': event.model.modelId,

      // LLM-level prompt data (passed via side-channel):
      'ai.prompt.messages': {
        input: () =>
          pendingStepPromptData?.promptMessages
            ? stringifyForTelemetry(pendingStepPromptData.promptMessages)
            : undefined,
      },
      'ai.prompt.tools': {
        input: () =>
          pendingStepPromptData?.tools?.map(tool => JSON.stringify(tool)),
      },
      'ai.prompt.toolChoice': {
        input: () =>
          pendingStepPromptData?.toolChoice != null
            ? JSON.stringify(pendingStepPromptData.toolChoice)
            : undefined,
      },

      // standardized gen-ai llm span attributes:
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

    const stepSpan = tracer.startSpan(
      'ai.generateText.doGenerate',
      { attributes },
      rootContext,
    );
    const stepContext = trace.setSpan(rootContext, stepSpan);

    state.stepSpan = stepSpan;
    state.stepContext = stepContext;
  });

  listenOnToolCallStart(event => {
    const state = callStates.get(event.callId);
    if (!state?.stepContext) return;

    const { tracer, telemetry, stepContext } = state;
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

    state.toolSpans.set(toolCall.toolCallId, {
      span: toolSpan,
      context: toolContext,
    });
  });

  listenOnToolCallFinish(event => {
    const state = callStates.get(event.callId);
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
  });

  listenOnStepFinish(event => {
    const state = callStates.get(event.callId);
    if (!state?.stepSpan) return;

    const { stepSpan, telemetry } = state;

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

        // standardized gen-ai llm span attributes:
        'gen_ai.response.finish_reasons': [event.finishReason],
        'gen_ai.response.id': event.response.id,
        'gen_ai.response.model': event.response.modelId,
        'gen_ai.usage.input_tokens': event.usage.inputTokens,
        'gen_ai.usage.output_tokens': event.usage.outputTokens,
      }),
    );

    stepSpan.end();
    state.stepSpan = undefined;
    state.stepContext = undefined;
  });

  listenOnFinish(event => {
    const state = callStates.get(event.callId);
    if (!state?.rootSpan) return;

    const { rootSpan, telemetry } = state;

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
    callStates.delete(event.callId);
  });
}

/**
 * Ends the root span for a call with an error. Call this from the
 * catch block in generateText/streamText so the root span is properly
 * closed even when onFinish never fires.
 */
export function recordOtelCallError(callId: string, error: unknown): void {
  const state = callStates.get(callId);
  if (!state?.rootSpan) return;

  const { rootSpan, stepSpan } = state;

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
  callStates.delete(callId);
}

// Auto-register listeners on module load
setupListeners();
