import type { Telemetry } from 'ai';
import { createNullLanguageModelUsage, DefaultStepResult } from 'ai/internal';
import { describe, expect, test, vi } from 'vitest';
import { createTurnLifecycle } from './turn-telemetry';

function createStep(stepNumber: number) {
  return new DefaultStepResult<{}, {}>({
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
    const lifecycle = createTurnLifecycle({
      callId: 'call-1',
      telemetry: { integrations: [integration] },
      callbacks: {},
      harnessId: 'mock',
      modelId: 'mock-model',
      instructions: undefined,
      tools: {},
      toolsContext: {},
      activeToolNames: [],
      toolSpecs: [],
      messages: [{ role: 'user', content: 'go' }],
      runtimeContext: {},
      output: undefined,
    });

    for (const stepNumber of [0, 1]) {
      await lifecycle.ensureStepOpen();
      await lifecycle.stepEnd(createStep(stepNumber));
    }

    expect(stepStartNumbers).toEqual([0, 1]);
    expect(stepEndNumbers).toEqual([0, 1]);
  });

  test('includes the callId when dispatching errors', async () => {
    const onError = vi.fn();
    const lifecycle = createTurnLifecycle({
      callId: 'call-1',
      telemetry: { integrations: [{ onError }] },
      callbacks: {},
      harnessId: 'mock',
      modelId: 'mock-model',
      instructions: undefined,
      tools: {},
      toolsContext: {},
      activeToolNames: [],
      toolSpecs: [],
      messages: [{ role: 'user', content: 'go' }],
      runtimeContext: {},
      output: undefined,
    });
    const error = new Error('bridge exited');

    await lifecycle.error(error);

    expect(onError).toHaveBeenCalledExactlyOnceWith({
      callId: 'call-1',
      error,
    });
  });

  test('dispatches aborts and settles the lifecycle', async () => {
    const onAbort = vi.fn();
    const onError = vi.fn();
    const onEnd = vi.fn();
    const lifecycle = createTurnLifecycle({
      callId: 'call-1',
      telemetry: { integrations: [{ onAbort, onError, onEnd }] },
      callbacks: {},
      harnessId: 'mock',
      modelId: 'mock-model',
      instructions: undefined,
      tools: {},
      toolsContext: {},
      activeToolNames: [],
      toolSpecs: [],
      messages: [{ role: 'user', content: 'go' }],
      runtimeContext: {},
      output: undefined,
    });
    const reason = new Error('stopped');
    const step = createStep(0);

    await lifecycle.ensureStepOpen();
    await lifecycle.stepEnd(step);
    await lifecycle.abort(reason);
    await lifecycle.error(new Error('late error'));
    await lifecycle.end({
      steps: [step],
      usage: createNullLanguageModelUsage(),
    });

    expect(onAbort).toHaveBeenCalledExactlyOnceWith({
      callId: 'call-1',
      steps: [
        expect.objectContaining({
          callId: 'call-1',
          stepNumber: 0,
        }),
      ],
      reason,
    });
    expect(onError).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });
});
