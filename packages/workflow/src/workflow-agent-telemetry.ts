import { createIdGenerator } from '@ai-sdk/provider-utils';
import {
  DefaultGeneratedFile,
  type DurableTelemetryContext,
  type Telemetry,
  type ToolSet,
} from 'ai';
import { createTelemetryDispatcher, DefaultStepResult } from 'ai/internal';

/**
 * Durable WorkflowAgent runs report telemetry when the run ends.
 *
 * Globally registered integrations are not visible in the workflow VM, and
 * the steps of one run can execute in different processes. Integrations such
 * as OpenTelemetry keep open spans in memory, so the lifecycle of a run can
 * only be reported from a single process. The workflow body therefore records
 * the run's telemetry events with the time they happened, and one step sends
 * them to the registered integrations when the run ends or suspends.
 *
 * The run's call ID is generated in the workflow body and shared with its
 * model steps. A preparation step captures each integration's tracing and
 * sampling context. Bound integrations report model calls live and reconstruct
 * the enclosing spans at completion. Integrations without a durable bridge
 * retain live per-model tracing; ordinary event integrations receive the run.
 */

const recordedEventTypes = [
  'onStart',
  'onStepStart',
  'onLanguageModelCallStart',
  'onLanguageModelCallEnd',
  'onToolExecutionStart',
  'onToolExecutionEnd',
  'onStepEnd',
  'onEnd',
  'onAbort',
  'onError',
] as const;

type RecordedEventType = (typeof recordedEventTypes)[number];

/**
 * A telemetry event captured in the workflow body, reduced to values the
 * workflow runtime can serialize.
 */
export interface RecordedTelemetryEvent {
  type: RecordedEventType;
  /** Milliseconds since the Unix epoch. */
  timestamp: number;
  event: Record<string, unknown>;
}

/**
 * Serializable telemetry settings for reporting a recorded run.
 */
export interface RecordedTelemetrySettings {
  functionId?: string;
  recordInputs?: boolean;
  recordOutputs?: boolean;
}

const STEP_RESULT_MARKER = '__aiSdkStepResult';
const GENERATED_FILE_MARKER = '__aiSdkGeneratedFile';

const generateCallId = createIdGenerator({ prefix: 'call', size: 24 });

/**
 * Creates a telemetry integration that records the events it receives.
 *
 * Use it as the only integration of the workflow body's telemetry dispatcher.
 * Runtime and tool context are already filtered by the dispatcher, so only
 * opted-in fields are recorded.
 */
export function createWorkflowAgentTelemetryRecorder(): {
  integration: Telemetry;
  events: RecordedTelemetryEvent[];
  callId: string;
  contexts?: Array<DurableTelemetryContext | undefined>;
} {
  const events: RecordedTelemetryEvent[] = [];
  // Generated in the workflow body, where random values are replayed
  // deterministically, so model steps and the final report share it.
  const callId = generateCallId();
  const integration: Record<string, (event: unknown) => void> = {};

  for (const type of recordedEventTypes) {
    integration[type] = (event: unknown) => {
      events.push({
        type,
        timestamp: getTimestamp(event) ?? Date.now(),
        event: serializeEvent(type, event),
      });
    };
  }

  return { integration: integration as Telemetry, events, callId };
}

/** Resolve integration capabilities and sampling once, outside the workflow VM. */
export async function prepareWorkflowAgentTelemetry({
  callId,
  event,
}: {
  callId: string;
  event: RecordedTelemetryEvent;
}): Promise<Array<DurableTelemetryContext | undefined>> {
  'use step';
  return Promise.all(
    (globalThis.AI_SDK_TELEMETRY_INTEGRATIONS ?? []).map(async integration => {
      try {
        return await integration.experimental_durable?.captureContext({
          ...event.event,
          callId,
        } as never);
      } catch {
        // Preserve live model tracing if an integration cannot capture context.
        return undefined;
      }
    }),
  );
}

/**
 * Sends recorded run telemetry to the globally registered integrations.
 *
 * Runs as a step so that integrations are available and every event of the
 * run is handled by one process. Events are sent in the order they were
 * recorded with their original timestamps; replay timestamps are clamped to
 * preserve event order when step and workflow clocks drift. A run without an
 * end or error event is closed with
 * an abort event.
 */
export async function reportWorkflowAgentTelemetry({
  telemetry,
  events,
  callId = generateCallId(),
  contexts,
}: {
  telemetry: RecordedTelemetrySettings;
  events: RecordedTelemetryEvent[];
  /** The run's telemetry call ID, also used by its model steps. */
  callId?: string;
  contexts?: Array<DurableTelemetryContext | undefined>;
}): Promise<void> {
  'use step';

  for (const [index, integration] of (
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS ?? []
  ).entries()) {
    const run = contexts?.[index];
    // Integrations without a bridge already reported live per-model operations.
    if (integration.experimental_durable != null && run == null) continue;
    try {
      const dispatcher = createTelemetryDispatcher({
        telemetry: { ...telemetry, integrations: integration },
      }) as Record<
        string,
        ((event: unknown) => PromiseLike<void> | void) | undefined
      >;
      const completedSteps: unknown[] = [];
      let timestamp = Number.NEGATIVE_INFINITY;
      let isStarted = false;
      let isClosed = false;

      for (const record of events) {
        timestamp = Math.max(timestamp, record.timestamp);
        const event = deserializeEvent(record.event, callId) as Record<
          string,
          unknown
        >;

        switch (record.type) {
          case 'onStart': {
            isStarted = true;
            await dispatcher.onStart?.({
              ...event,
              callId,
              timestamp,
              ...(run == null
                ? {}
                : { durableContext: { run, phase: 'replay' } }),
            });
            break;
          }
          case 'onStepStart': {
            const { stepCount, ...stepStartEvent } = event;
            await dispatcher.onStepStart?.({
              ...stepStartEvent,
              callId,
              timestamp,
              steps: completedSteps.slice(0, stepCount as number),
            });
            break;
          }
          case 'onToolExecutionEnd': {
            await dispatcher.onToolExecutionEnd?.(
              withToolOutput({ ...event, callId, timestamp }),
            );
            break;
          }
          case 'onStepEnd': {
            const step = Object.assign(event, { callId, timestamp });
            completedSteps.push(step);
            await dispatcher.onStepEnd?.(step);
            break;
          }
          case 'onEnd': {
            isClosed = true;
            await dispatcher.onEnd?.(
              withFinalStepFields({ ...event, callId, timestamp }),
            );
            break;
          }
          case 'onAbort': {
            isClosed = true;
            await dispatcher.onAbort?.({ ...event, callId, timestamp });
            break;
          }
          case 'onError': {
            isClosed = true;
            await dispatcher.onError?.({
              error: event.error,
              callId,
              timestamp,
            });
            break;
          }
          default: {
            await dispatcher[record.type]?.({ ...event, callId, timestamp });
          }
        }
      }

      if (isStarted && !isClosed) {
        await dispatcher.onAbort?.({
          callId,
          steps: completedSteps,
          timestamp,
        });
      }
    } catch {
      // A failed integration must not prevent the others from reporting.
    }
  }
}

/**
 * The body's end event carries the last step's fields without the getters
 * of a step result. Like `streamText`, take the text and reasoning from the
 * final step and collect tool calls, tool results, files, and sources from all
 * steps.
 */
function withFinalStepFields(event: Record<string, unknown>) {
  const steps = ((event.steps as unknown[] | undefined) ?? []).filter(
    step => step instanceof DefaultStepResult,
  );
  const finalStep = event.finalStep ?? steps.at(-1);
  if (!(finalStep instanceof DefaultStepResult)) {
    return event;
  }
  const allSteps = steps.length > 0 ? steps : [finalStep];
  const collect = (key: keyof DefaultStepResult<any, any>) =>
    allSteps.flatMap(step => step[key] as unknown[]);

  return {
    ...finalStep,
    ...event,
    usage: event.usage ?? finalStep.usage,
    text: finalStep.text,
    reasoning: finalStep.reasoning,
    reasoningText: finalStep.reasoningText,
    files: collect('files'),
    sources: collect('sources'),
    toolCalls: collect('toolCalls'),
    staticToolCalls: collect('staticToolCalls'),
    dynamicToolCalls: collect('dynamicToolCalls'),
    toolResults: collect('toolResults'),
    staticToolResults: collect('staticToolResults'),
    dynamicToolResults: collect('dynamicToolResults'),
    finalStep,
  };
}

/**
 * WorkflowAgent reports tool results as `success` with `output` or `error`.
 * Add the `toolOutput` and `toolExecutionMs` fields of the core tool
 * execution end event, which integrations read.
 */
function withToolOutput(event: Record<string, unknown>) {
  if (event.toolOutput != null) {
    return event;
  }

  const toolCall = (event.toolCall ?? {}) as Record<string, unknown>;
  const base = {
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: toolCall.input,
    ...(toolCall.dynamic === true ? { dynamic: true } : {}),
  };

  return {
    ...event,
    toolExecutionMs: event.toolExecutionMs ?? event.durationMs,
    toolOutput:
      event.success === false
        ? { type: 'tool-error', ...base, error: event.error }
        : { type: 'tool-result', ...base, output: event.output },
  };
}

function getTimestamp(event: unknown): number | undefined {
  return isObject(event) && typeof event.timestamp === 'number'
    ? event.timestamp
    : undefined;
}

/** Normalize only SDK event fields; Workflow owns serialization of user data. */
function serializeEvent(
  type: RecordedEventType,
  value: unknown,
): Record<string, unknown> {
  if (type === 'onError')
    return {
      error:
        isObject(value) && 'callId' in value && 'error' in value
          ? value.error
          : value,
    };
  if (!isObject(value)) return {};
  if (type === 'onStepEnd') return serializeStep(value);
  const event = value as Record<string, any>;
  const { callId: _callId, timestamp: _timestamp, ...data } = event;
  switch (type) {
    case 'onStart':
    case 'onStepStart': {
      const { tools, output, steps, ...start } = data;
      return {
        ...start,
        tools:
          tools == null
            ? undefined
            : Object.fromEntries(
                Object.entries(tools as ToolSet).map(([name, tool]) => [
                  name,
                  {
                    type: tool.type ?? 'function',
                    description:
                      typeof tool.description === 'string'
                        ? tool.description
                        : undefined,
                    ...(tool.type === 'provider'
                      ? { id: tool.id, args: tool.args }
                      : {}),
                  },
                ]),
              ),
        output: output == null ? undefined : { name: output.name },
        ...(type === 'onStepStart' ? { stepCount: steps?.length ?? 0 } : {}),
      };
    }
    case 'onEnd':
      return {
        steps: (data.steps ?? []).map(serializeStep),
        usage: data.usage,
        totalUsage: data.totalUsage,
        runtimeContext: data.runtimeContext,
        toolsContext: data.toolsContext,
      };
    case 'onAbort':
      return { ...data, steps: (data.steps ?? []).map(serializeStep) };
    case 'onLanguageModelCallEnd':
      return { ...data, content: serializeContent(data.content) };
    default:
      return data;
  }
}

function serializeStep(step: Record<string, any>): Record<string, unknown> {
  return {
    [STEP_RESULT_MARKER]: true,
    stepNumber: step.stepNumber,
    model: step.model,
    runtimeContext: step.runtimeContext,
    toolsContext: step.toolsContext,
    content: serializeContent(step.content),
    finishReason: step.finishReason,
    rawFinishReason: step.rawFinishReason,
    usage: step.usage,
    performance: step.performance,
    warnings: step.warnings,
    request: step.request,
    response: step.response,
    providerMetadata: step.providerMetadata,
    experimental_steeringMessages: step.experimental_steeringMessages,
  };
}

function serializeContent(content: Array<Record<string, any>> = []) {
  return content.map(part =>
    (part.type === 'file' || part.type === 'reasoning-file') &&
    part.file != null
      ? {
          ...part,
          file: {
            [GENERATED_FILE_MARKER]: true,
            base64: part.file.base64,
            mediaType: part.file.mediaType,
            providerMetadata: part.file.providerMetadata,
          },
        }
      : { ...part },
  );
}

function deserializeEvent(
  event: Record<string, unknown>,
  callId: string,
): Record<string, unknown> {
  if (event[STEP_RESULT_MARKER] === true)
    return deserializeStep(event, callId) as unknown as Record<string, unknown>;
  return {
    ...event,
    ...('content' in event
      ? { content: deserializeContent(event.content) }
      : {}),
    ...('steps' in event
      ? {
          steps: (event.steps as Record<string, unknown>[]).map(step =>
            deserializeStep(step, callId),
          ),
        }
      : {}),
  };
}

function deserializeContent(content: unknown) {
  return ((content as Array<Record<string, any>>) ?? []).map(part =>
    (part.type === 'file' || part.type === 'reasoning-file') &&
    part.file?.[GENERATED_FILE_MARKER] === true
      ? {
          ...part,
          file: new DefaultGeneratedFile({
            data: part.file.base64,
            mediaType: part.file.mediaType,
            providerMetadata: part.file.providerMetadata,
          }),
        }
      : part,
  );
}

function deserializeStep(
  data: Record<string, any>,
  callId: string,
): DefaultStepResult<any, any> {
  return new DefaultStepResult({
    callId,
    stepNumber: data.stepNumber,
    provider: data.model?.provider ?? 'unknown',
    modelId: data.model?.modelId ?? 'unknown',
    runtimeContext: data.runtimeContext,
    toolsContext: data.toolsContext,
    content: deserializeContent(data.content) as never,
    finishReason: data.finishReason,
    rawFinishReason: data.rawFinishReason,
    usage: data.usage,
    performance: data.performance,
    warnings: data.warnings,
    request: data.request ?? {},
    response: data.response,
    providerMetadata: data.providerMetadata,
    steeringMessages: data.experimental_steeringMessages,
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
}
