import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { createIdGenerator } from '@ai-sdk/provider-utils';
import type { LanguageModel, ModelMessage } from 'ai';
import { createTelemetryDispatcher } from 'ai/internal';
import { buildModelStepResult } from './build-model-step-result.js';
import type {
  ModelCallOptions,
  ModelCallResult,
  ModelCallTelemetry,
} from './model-call.js';
import {
  resolveSerializableTools,
  type SerializableToolDef,
} from './serializable-schema.js';

const generateCallId = createIdGenerator({ prefix: 'call', size: 24 });

/**
 * Telemetry hooks for the language model call inside a durable model step.
 * Matches the options accepted by `streamLanguageModelCall`.
 */
export type LanguageModelCallTelemetry = {
  callId: string;
  onLanguageModelCallStart?: (event: any) => PromiseLike<void> | void;
  onLanguageModelCallEnd?: (event: any) => PromiseLike<void> | void;
  executeLanguageModelCallInTelemetryContext?: <T>(options: {
    callId: string;
    execute: () => PromiseLike<T>;
  }) => PromiseLike<T>;
};

/**
 * Global telemetry integrations are not visible in the workflow VM, so the
 * workflow body sends a serializable descriptor and the model step, which
 * runs in Node, dispatches the model call lifecycle itself.
 *
 * Each model call is reported as its own operation with a unique `callId`.
 */
export function shouldDispatchModelCallTelemetryInStep(telemetry?: {
  isEnabled?: boolean;
  integrations?: unknown;
}): boolean {
  return (
    telemetry?.isEnabled !== false &&
    telemetry?.integrations == null &&
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS == null
  );
}

export async function runModelCallWithTelemetry({
  telemetry,
  modelInit,
  prompt,
  serializedTools,
  options,
  execute,
}: {
  telemetry: ModelCallTelemetry | undefined;
  modelInit: LanguageModel;
  prompt: LanguageModelV4Prompt;
  serializedTools: Record<string, SerializableToolDef> | undefined;
  options: ModelCallOptions | undefined;
  execute: (
    languageModelCallTelemetry: LanguageModelCallTelemetry | undefined,
  ) => Promise<ModelCallResult>;
}): Promise<ModelCallResult> {
  if (telemetry == null) {
    return execute(undefined);
  }

  const dispatcher = createTelemetryDispatcher({ telemetry });
  const callId = generateCallId();
  const { provider, modelId } =
    typeof modelInit === 'string'
      ? { provider: 'gateway', modelId: modelInit }
      : modelInit;
  const tools =
    serializedTools == null
      ? undefined
      : resolveSerializableTools(serializedTools);
  const messages = prompt as unknown as ModelMessage[];

  await dispatcher.onStart?.({
    callId,
    operationId: 'ai.workflowAgent.stream',
    provider,
    modelId,
    system: undefined,
    messages,
    tools,
    toolChoice: options?.toolChoice,
    activeTools: undefined,
    maxOutputTokens: options?.maxOutputTokens,
    temperature: options?.temperature,
    topP: options?.topP,
    topK: options?.topK,
    presencePenalty: options?.presencePenalty,
    frequencyPenalty: options?.frequencyPenalty,
    stopSequences: options?.stopSequences,
    seed: options?.seed,
    maxRetries: options?.maxRetries ?? 2,
    timeout: undefined,
    headers: options?.headers,
    reasoning: options?.reasoning,
    providerOptions: options?.providerOptions,
    output: undefined,
    runtimeContext: {},
    toolsContext: {},
  } as never);
  await dispatcher.onStepStart?.({
    callId,
    provider,
    modelId,
    stepNumber: telemetry.stepNumber,
    system: undefined,
    messages,
    tools,
    toolChoice: options?.toolChoice,
    activeTools: undefined,
    steps: [],
    providerOptions: options?.providerOptions,
    output: undefined,
    runtimeContext: {},
    toolsContext: {},
  } as never);

  let result: ModelCallResult;
  try {
    result = await execute({
      callId,
      onLanguageModelCallStart: dispatcher.onLanguageModelCallStart,
      onLanguageModelCallEnd: dispatcher.onLanguageModelCallEnd,
      executeLanguageModelCallInTelemetryContext:
        dispatcher.executeLanguageModelCall,
    });
  } catch (error) {
    await dispatcher.onError?.({ callId, error });
    throw error;
  }

  if (result.aborted) {
    await dispatcher.onAbort?.({ callId, steps: [] } as never);
    return result;
  }

  if ('terminalError' in result) {
    await dispatcher.onError?.({ callId, error: result.terminalError });
    return result;
  }

  const step = await buildModelStepResult(
    result.raw,
    result.toolCalls,
    result.finish,
    result.providerExecutedToolResults,
    {
      callId,
      tools,
      stepNumber: telemetry.stepNumber,
      runtimeContext: {},
      toolsContext: {},
    },
  );

  await dispatcher.onStepEnd?.(step as never);
  // Keep the step's prototype so getters such as `text` stay available.
  await dispatcher.onEnd?.(
    Object.assign(Object.create(Object.getPrototypeOf(step)), step, {
      finalStep: step,
      steps: [step],
      usage: step.usage,
      totalUsage: step.usage,
    }),
  );

  return result;
}
