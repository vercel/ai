import { createIdGenerator } from '@ai-sdk/provider-utils';
import { createTelemetryDispatcher } from 'ai/internal';
import { buildModelStepResult } from './build-model-step-result.js';
import type { ModelCallResult, ModelCallTelemetry } from './model-call.js';
import {
  resolveSerializableTools,
  type SerializableToolDef,
} from './serializable-schema.js';

const generateCallId = createIdGenerator({ prefix: 'call', size: 24 });

const OPERATION_ID = 'ai.workflowAgent.stream';

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
 * Global telemetry integrations are not visible in the workflow VM. When the
 * workflow body cannot reach any integration, it records the run's telemetry
 * events and reports them from a step when the run ends (see
 * `workflow-agent-telemetry.ts`). Model steps run the provider call in the
 * integrations' context and return its timing.
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

/**
 * Report model calls live. A bound durable integration receives the run's
 * serialized tracing context; an integration without a bridge retains its
 * existing per-model operation. Other integrations receive the recorded run.
 */
export async function runModelCallWithTelemetry<
  RESULT extends ModelCallResult,
>({
  telemetry,
  serializedTools,
  execute,
}: {
  telemetry: ModelCallTelemetry | undefined;
  serializedTools?: Record<string, SerializableToolDef>;
  execute: (hooks: LanguageModelCallTelemetry | undefined) => Promise<RESULT>;
}): Promise<RESULT> {
  if (telemetry == null) return execute(undefined);
  const callId = telemetry.callId ?? generateCallId();
  const dispatcher = createTelemetryDispatcher({ telemetry });
  const bindings = (globalThis.AI_SDK_TELEMETRY_INTEGRATIONS ?? []).flatMap(
    (integration, index) => {
      if (integration.experimental_durable == null) return [];
      return [
        {
          run: telemetry.contexts?.[index],
          dispatcher: createTelemetryDispatcher({
            telemetry: { ...telemetry, integrations: integration },
          }),
          started: false,
        },
      ];
    },
  );
  const runtimeContext = telemetry.runtimeContext ?? {};
  const fallbackTools = bindings.some(binding => binding.run == null)
    ? resolveSerializableTools(serializedTools ?? {})
    : undefined;
  const startedAt = Date.now();
  let result: RESULT;
  try {
    result = await execute({
      callId,
      onLanguageModelCallStart:
        bindings.length === 0
          ? undefined
          : async event => {
              for (const binding of bindings) {
                const { dispatcher: live, run } = binding;
                if (run == null && !binding.started) {
                  await live.onStart?.({
                    ...event,
                    callId,
                    operationId: OPERATION_ID,
                    runtimeContext,
                    toolsContext: {},
                    tools: fallbackTools,
                  } as never);
                  await live.onStepStart?.({
                    ...event,
                    callId,
                    stepNumber: telemetry.stepNumber,
                    steps: [],
                    runtimeContext,
                    toolsContext: {},
                    tools: fallbackTools,
                  } as never);
                  binding.started = true;
                }
                await live.onLanguageModelCallStart?.({
                  ...event,
                  callId,
                  ...(run == null
                    ? {}
                    : {
                        durableContext: {
                          run,
                          stepNumber: telemetry.stepNumber,
                          phase: 'live',
                          runtimeContext,
                          headers: event.headers,
                        },
                      }),
                });
              }
            },
      onLanguageModelCallEnd:
        bindings.length === 0
          ? undefined
          : async event => {
              for (const binding of bindings)
                await binding.dispatcher.onLanguageModelCallEnd?.({
                  ...event,
                  callId,
                });
            },
      executeLanguageModelCallInTelemetryContext:
        dispatcher.executeLanguageModelCall,
    });
  } catch (error) {
    for (const binding of bindings)
      await binding.dispatcher.onError?.({
        callId,
        error,
        timestamp: Date.now(),
      });
    throw error;
  }
  const endedAt = Date.now();
  for (const binding of bindings) {
    const live = binding.dispatcher;
    if (result.aborted) {
      await live.onAbort?.({ callId, steps: [], timestamp: endedAt } as never);
    } else if ('terminalError' in result) {
      await live.onError?.({
        callId,
        error: result.terminalError,
        timestamp: endedAt,
      });
    } else if (binding.run == null && binding.started) {
      const step = await buildModelStepResult(
        result.raw,
        result.toolCalls,
        result.finish,
        result.providerExecutedToolResults,
        {
          callId,
          tools: fallbackTools,
          stepNumber: telemetry.stepNumber,
          runtimeContext,
          toolsContext: {},
        },
      );
      await live.onStepEnd?.(step as never);
      await live.onEnd?.(
        Object.assign(Object.create(Object.getPrototypeOf(step)), step, {
          finalStep: step,
          steps: [step],
          totalUsage: step.usage,
        }),
      );
    }
  }
  return { ...result, timing: { startedAt, endedAt } };
}
