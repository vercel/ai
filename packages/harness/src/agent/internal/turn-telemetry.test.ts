import type { Telemetry } from 'ai';
import { createNullLanguageModelUsage, DefaultStepResult } from 'ai/internal';
import { describe, expect, test } from 'vitest';
import { createTurnLifecycle } from './turn-telemetry';

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
      await lifecycle.stepEnd(
        new DefaultStepResult({
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
        }),
      );
    }

    expect(stepStartNumbers).toEqual([0, 1]);
    expect(stepEndNumbers).toEqual([0, 1]);
  });
});
