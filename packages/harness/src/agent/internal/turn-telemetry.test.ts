import type { Telemetry, ToolSet } from 'ai';
import { createNullLanguageModelUsage, DefaultStepResult } from 'ai/internal';
import { describe, expect, test, vi } from 'vitest';
import { createTurnLifecycle } from './turn-telemetry';

function makeLifecycle(integration: Telemetry) {
  return createTurnLifecycle({
    callId: 'call-1',
    telemetry: { integrations: [integration] },
    callbacks: {},
    harnessId: 'mock',
    modelId: 'mock-model',
    instructions: undefined,
    tools: {} as ToolSet,
    toolsContext: {},
    activeToolNames: [],
    toolSpecs: [],
    messages: [{ role: 'user', content: 'go' }],
    runtimeContext: {},
    output: undefined,
  });
}

function makeStep(stepNumber: number) {
  return new DefaultStepResult({
    callId: 'call-1',
    stepNumber,
    provider: 'harness:mock',
    modelId: 'mock-model',
    runtimeContext: {},
    toolsContext: {},
    content: [],
    finishReason: 'stop',
    rawFinishReason: 'stop',
    usage: createNullLanguageModelUsage(),
    performance: {
      effectiveOutputTokensPerSecond: 0,
      outputTokensPerSecond: undefined,
      inputTokensPerSecond: undefined,
      effectiveTotalTokensPerSecond: 0,
      stepTimeMs: 0,
      responseTimeMs: 0,
      toolExecutionMs: {},
      timeToFirstOutputMs: undefined,
    },
    warnings: undefined,
    request: {},
    response: {
      id: `response-${stepNumber}`,
      modelId: 'mock-model',
      timestamp: new Date(0),
      messages: [],
    },
    providerMetadata: undefined,
  });
}

describe('createTurnLifecycle', () => {
  test('includes the current stepNumber on onStepEnd events', async () => {
    const stepStartNumbers: number[] = [];
    const stepEndNumbers: number[] = [];
    const integration = {
      onStepStart: event => {
        stepStartNumbers.push(event.stepNumber);
      },
      onStepEnd: event => {
        stepEndNumbers.push(event.stepNumber);
      },
    } satisfies Telemetry;
    const lifecycle = makeLifecycle(integration);

    for (const stepNumber of [0, 1]) {
      await lifecycle.ensureStepOpen();
      await lifecycle.stepEnd(makeStep(stepNumber));
    }

    expect(stepStartNumbers).toEqual([0, 1]);
    expect(stepEndNumbers).toEqual([0, 1]);
  });

  test('dispatches onError with the callId, like generateText and streamText', async () => {
    const onError = vi.fn();
    const lifecycle = makeLifecycle({ onError } satisfies Telemetry);
    const error = new Error('bridge exited');

    await lifecycle.ensureStepOpen();
    await lifecycle.error(error);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ callId: 'call-1', error }),
    );
  });

  test('dispatches onAbort with the callId, the finished steps and the reason', async () => {
    const onStart = vi.fn();
    const onAbort = vi.fn();
    const onError = vi.fn();
    const onEnd = vi.fn();
    const lifecycle = makeLifecycle({
      onStart,
      onAbort,
      onError,
      onEnd,
    } satisfies Telemetry);

    await lifecycle.ensureStepOpen();
    await lifecycle.stepEnd(makeStep(0));
    await lifecycle.ensureStepOpen();
    await lifecycle.abort('user stop');

    expect(onAbort).toHaveBeenCalledTimes(1);
    const event = onAbort.mock.calls[0]![0];
    expect(event).toEqual(
      expect.objectContaining({ callId: 'call-1', reason: 'user stop' }),
    );
    expect(
      event.steps.map((step: { stepNumber: number }) => step.stepNumber),
    ).toEqual([0]);
    expect(onError).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    expect(onStart).toHaveBeenCalledTimes(1);

    // The turn is settled: a later error or end is a no-op.
    await lifecycle.error(new Error('late'));
    await lifecycle.end({
      steps: [makeStep(0)],
      usage: createNullLanguageModelUsage(),
    });
    expect(onError).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  test('starts the turn before reporting an abort that happened before any step', async () => {
    const onStart = vi.fn();
    const onAbort = vi.fn();
    const lifecycle = makeLifecycle({ onStart, onAbort } satisfies Telemetry);

    await lifecycle.abort();

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onAbort).toHaveBeenCalledWith(
      expect.objectContaining({ callId: 'call-1', steps: [] }),
    );
    expect(onAbort.mock.calls[0]![0]).not.toHaveProperty('reason');
  });
});
