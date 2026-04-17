import type {
  OnStartEvent,
  OnStepStartEvent,
  OnStepFinishEvent,
  OnChunkEvent,
  ObjectOnStartEvent,
  ObjectOnStepStartEvent,
  ObjectOnStepFinishEvent,
  TelemetryIntegration,
  ToolSet,
} from 'ai';
import {
  createRun,
  createStep,
  updateStepResult,
  notifyServerAsync,
} from './db.js';

type OperationType = 'generate' | 'stream';

interface StepState {
  stepId: string;
  startTime: number;
  streamChunks: unknown[];
  rawStreamChunks: unknown[];
}

interface CallState {
  runId: string;
  operationType: OperationType;
  functionId: string | undefined;
  settings: Record<string, unknown>;
  stepStates: Map<number, StepState>;
}

const activeSteps = new Map<string, StepState>();

let signalHandlersRegistered = false;
const registerSignalHandlers = () => {
  if (signalHandlersRegistered) return;
  signalHandlersRegistered = true;

  const cleanup = async () => {
    if (activeSteps.size === 0) return;

    const promises = Array.from(activeSteps.entries()).map(
      async ([stepId, data]) => {
        const durationMs = Date.now() - data.startTime;
        await updateStepResult(stepId, {
          duration_ms: durationMs,
          output: null,
          usage: null,
          error: 'Request aborted',
          raw_request: null,
          raw_response: null,
          raw_chunks: null,
        });
      },
    );
    await Promise.all(promises);
    await notifyServerAsync('step-update');
  };

  process.on('SIGINT', () => {
    cleanup().then(() => process.exit(130));
  });

  process.on('SIGTERM', () => {
    cleanup().then(() => process.exit(143));
  });
};

const generateRunId = (): string => {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 17);
  const uniqueId = crypto.randomUUID().slice(0, 8);
  return `${timestamp}-${uniqueId}`;
};

function getOperationType(operationId: string): OperationType {
  if (operationId === 'ai.streamText' || operationId === 'ai.streamObject') {
    return 'stream';
  }
  return 'generate';
}

/**
 * Creates a devtools telemetry integration that logs all AI SDK operations
 * to the devtools viewer.
 *
 * Usage:
 * ```ts
 * import { registerTelemetryIntegration } from 'ai';
 * import { DevToolsTelemetry } from '@ai-sdk/devtools';
 *
 * registerTelemetryIntegration(DevToolsTelemetry());
 * ```
 *
 * Telemetry is enabled by default — no need to set `telemetry`
 * unless you want to configure `functionId`, `recordInputs`, or `recordOutputs`.
 */
export function DevToolsTelemetry(): TelemetryIntegration {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '@ai-sdk/devtools should not be used in production. ' +
        'Remove DevToolsTelemetry from your telemetry configuration for production builds.',
    );
  }

  registerSignalHandlers();

  const callStates = new Map<string, CallState>();

  // When executeTool runs a tool's execute function, any nested generateText/
  // streamText call inside that tool gets its own callId. We track the nesting
  // so that the inner call's run can be linked to the parent.
  //
  // We use a per-toolCallId Map instead of a single variable so that parallel
  // tool calls
  const toolContextMap = new Map<
    string,
    { parentCallId: string; parentToolCallId: string }
  >();
  let currentToolCallId: string | null = null;

  function resolveParentInfo(): { runId: string; stepId: string } | undefined {
    if (!currentToolCallId) return undefined;

    const ctx = toolContextMap.get(currentToolCallId);
    if (!ctx) return undefined;

    const parentState = callStates.get(ctx.parentCallId);
    if (!parentState) return undefined;

    // Find the step that is currently executing the tool call.
    // This is the most recent (highest step number) step in the parent call.
    let latestStepId: string | undefined;
    let latestStepNumber = -1;
    for (const [stepNumber, stepState] of parentState.stepStates) {
      if (stepNumber > latestStepNumber) {
        latestStepNumber = stepNumber;
        latestStepId = stepState.stepId;
      }
    }

    if (!latestStepId) return undefined;

    return { runId: parentState.runId, stepId: latestStepId };
  }

  function getOrCreateCallState(
    callId: string,
    operationId: string,
    event: {
      functionId?: string | undefined;
      maxOutputTokens?: number | undefined;
      temperature?: number | undefined;
      topP?: number | undefined;
      topK?: number | undefined;
      presencePenalty?: number | undefined;
      frequencyPenalty?: number | undefined;
      seed?: number | undefined;
    },
  ): CallState {
    let state = callStates.get(callId);
    if (state) return state;

    state = {
      runId: generateRunId(),
      operationType: getOperationType(operationId),
      functionId: event.functionId,
      settings: {
        maxOutputTokens: event.maxOutputTokens,
        temperature: event.temperature,
        topP: event.topP,
        topK: event.topK,
        presencePenalty: event.presencePenalty,
        frequencyPenalty: event.frequencyPenalty,
        seed: event.seed,
      },
      stepStates: new Map(),
    };
    callStates.set(callId, state);
    return state;
  }

  const integration: TelemetryIntegration = {
    onStart: async event => {
      const operationId = (event as { operationId: string }).operationId;

      if (
        operationId === 'ai.embed' ||
        operationId === 'ai.embedMany' ||
        operationId === 'ai.rerank'
      ) {
        return;
      }

      const startEvent = event as OnStartEvent<ToolSet> | ObjectOnStartEvent;

      const parentInfo = resolveParentInfo();

      const state = getOrCreateCallState(
        startEvent.callId,
        operationId,
        startEvent,
      );

      await createRun(state.runId, parentInfo, state.functionId);
    },

    onStepStart: async event => {
      const stepStartEvent = event as OnStepStartEvent<ToolSet> & {
        promptMessages?: unknown[];
      };

      const state = callStates.get(stepStartEvent.callId);
      if (!state) return;

      const stepId = crypto.randomUUID();
      const startTime = Date.now();

      const stepState: StepState = {
        stepId,
        startTime,
        streamChunks: [],
        rawStreamChunks: [],
      };
      state.stepStates.set(stepStartEvent.stepNumber, stepState);
      activeSteps.set(stepId, stepState);

      const prompt = stepStartEvent.promptMessages ?? stepStartEvent.messages;

      await createStep({
        id: stepId,
        run_id: state.runId,
        step_number: stepStartEvent.stepNumber + 1,
        type: state.operationType,
        model_id: stepStartEvent.modelId,
        provider: stepStartEvent.provider ?? null,
        started_at: new Date().toISOString(),
        input: JSON.stringify({
          prompt,
          tools: stepStartEvent.tools
            ? Object.entries(stepStartEvent.tools).map(([name, tool]) => ({
                name,
                description: (tool as { description?: string }).description,
                parameters: (tool as { parameters?: unknown }).parameters,
              }))
            : undefined,
          toolChoice: stepStartEvent.toolChoice,
          maxOutputTokens: state.settings.maxOutputTokens,
          temperature: state.settings.temperature,
          topP: state.settings.topP,
          topK: state.settings.topK,
          presencePenalty: state.settings.presencePenalty,
          frequencyPenalty: state.settings.frequencyPenalty,
          seed: state.settings.seed,
        }),
        provider_options: stepStartEvent.providerOptions
          ? JSON.stringify(stepStartEvent.providerOptions)
          : null,
      });
    },

    onObjectStepStart: async event => {
      const stepStartEvent = event as ObjectOnStepStartEvent & {
        promptMessages?: unknown[];
      };

      const state = callStates.get(stepStartEvent.callId);
      if (!state) return;

      const stepId = crypto.randomUUID();
      const startTime = Date.now();

      const stepState: StepState = {
        stepId,
        startTime,
        streamChunks: [],
        rawStreamChunks: [],
      };
      state.stepStates.set(stepStartEvent.stepNumber, stepState);
      activeSteps.set(stepId, stepState);

      await createStep({
        id: stepId,
        run_id: state.runId,
        step_number: stepStartEvent.stepNumber + 1,
        type: state.operationType,
        model_id: stepStartEvent.modelId,
        provider: stepStartEvent.provider ?? null,
        started_at: new Date().toISOString(),
        input: JSON.stringify({
          prompt: stepStartEvent.promptMessages,
          maxOutputTokens: state.settings.maxOutputTokens,
          temperature: state.settings.temperature,
          topP: state.settings.topP,
          topK: state.settings.topK,
          presencePenalty: state.settings.presencePenalty,
          frequencyPenalty: state.settings.frequencyPenalty,
          seed: state.settings.seed,
        }),
        provider_options: stepStartEvent.providerOptions
          ? JSON.stringify(stepStartEvent.providerOptions)
          : null,
      });
    },

    onChunk: async event => {
      const { chunk } = event as OnChunkEvent;

      if (chunk.type === 'raw') {
        const rawValue = (chunk as { rawValue: unknown }).rawValue;
        for (const [, state] of callStates) {
          let latestStepState: StepState | undefined;
          let latestStepNumber = -1;
          for (const [stepNumber, ss] of state.stepStates) {
            if (stepNumber > latestStepNumber) {
              latestStepNumber = stepNumber;
              latestStepState = ss;
            }
          }
          if (latestStepState) {
            latestStepState.rawStreamChunks.push(rawValue);
            return;
          }
        }
        return;
      }

      if ('callId' in chunk && 'stepNumber' in chunk) {
        const typed = chunk as { callId: string; stepNumber: number };
        const state = callStates.get(typed.callId);
        if (!state) return;
        const stepState = state.stepStates.get(typed.stepNumber);
        if (!stepState) return;
        stepState.streamChunks.push(chunk);
        return;
      }

      for (const [, state] of callStates) {
        let latestStepState: StepState | undefined;
        let latestStepNumber = -1;
        for (const [stepNumber, ss] of state.stepStates) {
          if (stepNumber > latestStepNumber) {
            latestStepNumber = stepNumber;
            latestStepState = ss;
          }
        }
        if (latestStepState) {
          latestStepState.streamChunks.push(chunk);
          return;
        }
      }
    },

    onStepFinish: async event => {
      const stepResult = event as OnStepFinishEvent<ToolSet>;

      const state = callStates.get(stepResult.callId);
      if (!state) return;

      const stepState = state.stepStates.get(stepResult.stepNumber);
      if (!stepState) return;

      activeSteps.delete(stepState.stepId);

      const durationMs = Date.now() - stepState.startTime;

      const output = {
        content: stepResult.content,
        finishReason: stepResult.finishReason,
        response: {
          id: stepResult.response.id,
          modelId: stepResult.response.modelId,
          timestamp: stepResult.response.timestamp,
          messages: stepResult.response.messages,
        },
      };

      const hasStreamChunks = stepState.streamChunks.length > 0;
      const hasRawStreamChunks = stepState.rawStreamChunks.length > 0;

      await updateStepResult(stepState.stepId, {
        duration_ms: durationMs,
        output: JSON.stringify(output),
        usage: stepResult.usage ? JSON.stringify(stepResult.usage) : null,
        error: null,
        raw_request: stepResult.request?.body
          ? JSON.stringify(stepResult.request.body)
          : null,
        raw_response: stepResult.response?.body
          ? JSON.stringify(stepResult.response.body)
          : hasStreamChunks
            ? JSON.stringify(stepState.streamChunks)
            : null,
        raw_chunks: hasRawStreamChunks
          ? JSON.stringify(stepState.rawStreamChunks)
          : null,
      });

      state.stepStates.delete(stepResult.stepNumber);
    },

    onObjectStepFinish: async event => {
      const stepResult = event as ObjectOnStepFinishEvent;

      const state = callStates.get(stepResult.callId);
      if (!state) return;

      const stepState = state.stepStates.get(stepResult.stepNumber);
      if (!stepState) return;

      activeSteps.delete(stepState.stepId);

      const durationMs = Date.now() - stepState.startTime;

      const output = {
        finishReason: stepResult.finishReason,
        objectText: stepResult.objectText,
        response: {
          id: stepResult.response.id,
          modelId: stepResult.response.modelId,
          timestamp: stepResult.response.timestamp,
        },
      };

      await updateStepResult(stepState.stepId, {
        duration_ms: durationMs,
        output: JSON.stringify(output),
        usage: stepResult.usage ? JSON.stringify(stepResult.usage) : null,
        error: null,
        raw_request: stepResult.request?.body
          ? JSON.stringify(stepResult.request.body)
          : null,
        raw_response: stepResult.response?.body
          ? JSON.stringify(stepResult.response.body)
          : null,
      });

      state.stepStates.delete(stepResult.stepNumber);
    },

    onFinish: async event => {
      const finishEvent = event as { callId: string };
      callStates.delete(finishEvent.callId);
    },

    onError: async error => {
      const errorObj = error as
        | { callId?: string; error?: unknown }
        | undefined;
      const callId = errorObj?.callId;
      if (!callId) return;

      const state = callStates.get(callId);
      if (!state) return;

      const cause = errorObj?.error ?? error;
      const errorMessage =
        cause instanceof Error ? cause.message : String(cause);

      for (const [, stepState] of state.stepStates) {
        activeSteps.delete(stepState.stepId);
        const durationMs = Date.now() - stepState.startTime;
        await updateStepResult(stepState.stepId, {
          duration_ms: durationMs,
          output: null,
          usage: null,
          error: errorMessage,
          raw_request: null,
          raw_response: null,
          raw_chunks: null,
        });
      }

      callStates.delete(callId);
    },

    executeTool: async ({ callId, toolCallId, execute }) => {
      toolContextMap.set(toolCallId, {
        parentCallId: callId,
        parentToolCallId: toolCallId,
      });

      const previousToolCallId = currentToolCallId;
      currentToolCallId = toolCallId;

      try {
        return await execute();
      } finally {
        currentToolCallId = previousToolCallId;
        toolContextMap.delete(toolCallId);
      }
    },
  };

  return integration;
}
