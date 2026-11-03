import { DefaultGeneratedFile } from 'ai';
import { DefaultStepResult } from 'ai/internal';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWorkflowAgentTelemetryRecorder,
  reportWorkflowAgentTelemetry,
  type RecordedTelemetryEvent,
} from './workflow-agent-telemetry.js';

const usage = {
  inputTokens: 5,
  inputTokenDetails: {
    noCacheTokens: 5,
    cacheReadTokens: undefined,
    cacheWriteTokens: undefined,
  },
  outputTokens: 10,
  outputTokenDetails: { textTokens: 10, reasoningTokens: undefined },
  totalTokens: 15,
};

function createStep(stepNumber: number, content: unknown[]) {
  return new DefaultStepResult({
    callId: 'workflow-agent',
    stepNumber,
    provider: 'mock-provider',
    modelId: 'mock-model',
    runtimeContext: {},
    toolsContext: {},
    content: content as never,
    finishReason: 'stop',
    rawFinishReason: 'stop',
    usage,
    performance: { responseTimeMs: 10 } as never,
    warnings: [],
    request: {},
    response: {
      id: `response-${stepNumber}`,
      timestamp: new Date(0),
      modelId: 'mock-model',
      messages: [],
    },
    providerMetadata: undefined,
  });
}

async function report(recorder: {
  events: RecordedTelemetryEvent[];
  callId: string;
}) {
  const received: Array<{ type: string; event: any }> = [];
  const integration = new Proxy(
    {},
    {
      get: (_, type: string) =>
        type === 'experimental_durable'
          ? undefined
          : (event: unknown) => void received.push({ type, event }),
    },
  );
  vi.stubGlobal('AI_SDK_TELEMETRY_INTEGRATIONS', [integration]);
  await reportWorkflowAgentTelemetry({
    telemetry: { functionId: 'test-function' },
    // The workflow runtime serializes step arguments.
    events: structuredClone(recorder.events),
    callId: recorder.callId,
  });
  return received.filter(({ type }) => type !== 'onStepFinish');
}

describe('WorkflowAgent run telemetry', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('restores normalized step results, generated files, and aggregate end fields', async () => {
    const recorder = createWorkflowAgentTelemetryRecorder();
    const record = recorder.integration as Record<string, (event: any) => void>;
    const file = new DefaultGeneratedFile({
      data: new Uint8Array([1, 2, 3]),
      mediaType: 'image/png',
    });
    const first = createStep(0, [{ type: 'file', file }]);
    const final = createStep(1, [{ type: 'text', text: 'done' }]);
    record.onStart({ messages: [], timestamp: 1_000 });
    // WorkflowAgent spreads step instances before dispatching telemetry.
    record.onStepEnd({ ...first, model: first.model, timestamp: 1_200 });
    record.onStepEnd({ ...final, model: final.model, timestamp: 1_100 });
    record.onEnd({
      steps: [first, final],
      totalUsage: usage,
      timestamp: 1_300,
    });
    const received = await report(recorder);
    expect(received.map(({ type }) => type)).toEqual([
      'onStart',
      'onStepEnd',
      'onStepEnd',
      'onEnd',
    ]);
    expect(received.map(({ event }) => event.timestamp)).toEqual([
      1_000, 1_200, 1_200, 1_300,
    ]);
    expect(
      received.every(({ event }) => event.callId === recorder.callId),
    ).toBe(true);
    const step = received.find(event => event.type === 'onStepEnd')!.event;
    expect(step).toBeInstanceOf(DefaultStepResult);
    expect(step.files[0]).toBeInstanceOf(DefaultGeneratedFile);
    expect(step.files[0].uint8Array).toEqual(new Uint8Array([1, 2, 3]));
    const end = received.find(event => event.type === 'onEnd')!.event;
    expect(end).toMatchObject({ text: 'done', usage, totalUsage: usage });
    expect(end.files[0].base64).toBe('AQID');
    expect(end.finalStep).toBeInstanceOf(DefaultStepResult);
  });

  it('closes incomplete runs and reports explicit errors', async () => {
    const recorder = createWorkflowAgentTelemetryRecorder();
    recorder.integration.onStart!({ messages: [] } as never);
    const aborted = await report(recorder);
    expect(aborted.at(-1)).toMatchObject({
      type: 'onAbort',
      event: { callId: recorder.callId, steps: [] },
    });
    recorder.integration.onError!(new Error('boom'));
    const failed = await report(recorder);
    expect(failed.at(-1)).toMatchObject({
      type: 'onError',
      event: { callId: recorder.callId, error: new Error('boom') },
    });
  });

  it('continues reporting to other integrations after one fails', async () => {
    const recorder = createWorkflowAgentTelemetryRecorder();
    recorder.integration.onStart!({ messages: [] } as never);
    const onStart = vi.fn();
    const onAbort = vi.fn();
    vi.stubGlobal('AI_SDK_TELEMETRY_INTEGRATIONS', [
      {
        onStart: () => {
          throw new Error('failed');
        },
      },
      { onStart, onAbort },
    ]);
    await reportWorkflowAgentTelemetry({
      telemetry: {},
      events: recorder.events,
    });
    expect(onStart).toHaveBeenCalledOnce();
    expect(onAbort).toHaveBeenCalledOnce();
  });
});
