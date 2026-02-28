import type { TelemetryHandler } from 'ai';
import {
  createRun,
  createStep,
  updateStepResult,
  notifyServerAsync,
  type ToolCallTiming,
} from './db.js';

const generateId = () => crypto.randomUUID();

const generateRunId = (): string => {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 17);
  const uniqueId = crypto.randomUUID().slice(0, 8);
  return `${timestamp}-${uniqueId}`;
};

/**
 * Convert a ToolSet (Record<string, Tool>) to the array format
 * the viewer expects: [{ name, description, parameters }].
 */
function toolSetToArray(
  tools: Record<string, unknown> | undefined,
):
  | Array<{ name: string; description?: string; parameters?: unknown }>
  | undefined {
  if (!tools) return undefined;
  return Object.entries(tools).map(([name, tool]) => {
    const t = tool as Record<string, unknown>;
    const schema = t.inputSchema as Record<string, unknown> | undefined;
    return {
      name,
      description: t.description as string | undefined,
      parameters: schema?.jsonSchema ?? schema,
    };
  });
}

export function devToolsHandler(): TelemetryHandler {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '@ai-sdk/devtools should not be used in production. ' +
        'Remove devToolsHandler from your telemetry configuration for production builds.',
    );
  }

  const runId = generateRunId();
  let runCreated = false;
  let stepCounter = 0;
  const stepIds = new Map<number, string>();
  const stepStartTimes = new Map<number, number>();
  const stepStreamChunks = new Map<number, unknown[]>();
  const stepRawChunks = new Map<number, unknown[]>();
  const stepToolCalls = new Map<number, ToolCallTiming[]>();
  const toolCallStartTimes = new Map<string, number>();
  let currentStepNumber = 0;

  let callSettings: Record<string, unknown> = {};

  const ensureRunCreated = async () => {
    if (!runCreated) {
      await createRun(runId);
      runCreated = true;
    }
  };

  return {
    async onStart(event) {
      callSettings = {
        maxOutputTokens: event.maxOutputTokens,
        temperature: event.temperature,
        topP: event.topP,
        topK: event.topK,
        presencePenalty: event.presencePenalty,
        frequencyPenalty: event.frequencyPenalty,
        seed: event.seed,
      };
    },

    async onStepStart(event) {
      await ensureRunCreated();
      stepCounter++;
      const stepId = generateId();
      const stepNumber = event.stepNumber;
      stepIds.set(stepNumber, stepId);
      stepStartTimes.set(stepNumber, Date.now());
      stepStreamChunks.set(stepNumber, []);
      stepRawChunks.set(stepNumber, []);
      stepToolCalls.set(stepNumber, []);
      currentStepNumber = stepNumber;

      await createStep({
        id: stepId,
        run_id: runId,
        step_number: stepCounter,
        type: 'stream',
        model_id: event.model.modelId,
        provider: event.model.provider,
        started_at: new Date().toISOString(),
        input: JSON.stringify({
          prompt: event.messages,
          system: event.system,
          tools: toolSetToArray(
            event.tools as Record<string, unknown> | undefined,
          ),
          toolChoice: event.toolChoice,
          ...callSettings,
        }),
        provider_options: event.providerOptions
          ? JSON.stringify(event.providerOptions)
          : null,
      });
    },

    onChunk(event: { chunk: { type: string; rawValue?: unknown } }) {
      if (event.chunk.type === 'raw') {
        const rawChunks = stepRawChunks.get(currentStepNumber);
        if (rawChunks) {
          rawChunks.push(event.chunk.rawValue);
        }
      } else {
        const streamChunks = stepStreamChunks.get(currentStepNumber);
        if (streamChunks) {
          streamChunks.push(event.chunk);
        }
      }
    },

    onToolCallStart(event) {
      const toolCallId = (event.toolCall as Record<string, unknown>)
        .toolCallId as string;
      toolCallStartTimes.set(toolCallId, Date.now());
    },

    async onToolCallFinish(event) {
      const toolCall = event.toolCall as Record<string, unknown>;
      const toolCallId = toolCall.toolCallId as string;
      const stepNumber = event.stepNumber ?? currentStepNumber;

      const startTime = toolCallStartTimes.get(toolCallId);
      const durationMs = startTime ? Date.now() - startTime : event.durationMs;
      toolCallStartTimes.delete(toolCallId);

      const timing: ToolCallTiming = {
        toolCallId,
        toolName: toolCall.toolName as string,
        started_at: startTime
          ? new Date(startTime).toISOString()
          : new Date().toISOString(),
        duration_ms: durationMs,
        args: toolCall.input ?? toolCall.args,
        output: event.success ? event.output : null,
        error: event.success ? null : event.error,
        success: event.success,
      };

      const calls = stepToolCalls.get(stepNumber);
      if (calls) {
        calls.push(timing);
      }
    },

    async onStepFinish(event) {
      const stepId = stepIds.get(event.stepNumber);
      if (!stepId) return;

      const startTime = stepStartTimes.get(event.stepNumber);
      const durationMs = startTime ? Date.now() - startTime : 0;

      const streamChunks = stepStreamChunks.get(event.stepNumber);
      const rawChunks = stepRawChunks.get(event.stepNumber);
      const toolCalls = stepToolCalls.get(event.stepNumber);

      await updateStepResult(stepId, {
        duration_ms: durationMs,
        output: JSON.stringify({
          content: event.content,
          finishReason: event.finishReason,
          response: event.response,
        }),
        usage: event.usage ? JSON.stringify(event.usage) : null,
        error: null,
        raw_request: event.request?.body
          ? JSON.stringify(event.request.body)
          : null,
        raw_response:
          streamChunks && streamChunks.length > 0
            ? JSON.stringify(streamChunks)
            : null,
        raw_chunks:
          rawChunks && rawChunks.length > 0 ? JSON.stringify(rawChunks) : null,
        tool_calls:
          toolCalls && toolCalls.length > 0 ? JSON.stringify(toolCalls) : null,
      });

      stepIds.delete(event.stepNumber);
      stepStartTimes.delete(event.stepNumber);
      stepStreamChunks.delete(event.stepNumber);
      stepRawChunks.delete(event.stepNumber);
      stepToolCalls.delete(event.stepNumber);
    },

    async onFinish() {
      await notifyServerAsync('run');
    },
  };
}
