import { describe, expect, it, vi } from 'vitest';
import { createNullLanguageModelUsage } from '../types/usage';
import { createRestrictedTelemetryDispatcher } from './restricted-telemetry-dispatcher';
import { DefaultStepResult } from './step-result';

const runtimeContext = {
  userId: 'user-123',
  requestId: 'request-123',
};

const sensitiveRuntimeContext = {
  userId: true,
};

function createStepResult(context = runtimeContext) {
  return new DefaultStepResult({
    callId: 'call-1',
    stepNumber: 0,
    provider: 'test-provider',
    modelId: 'test-model',
    runtimeContext: context,
    toolsContext: {},
    content: [{ type: 'text', text: 'Hello' }],
    finishReason: 'stop',
    rawFinishReason: 'stop',
    usage: createNullLanguageModelUsage(),
    warnings: [],
    request: {},
    response: {
      id: 'response-1',
      timestamp: new Date(0),
      modelId: 'test-model',
      messages: [],
    },
    providerMetadata: undefined,
  });
}

describe('createRestrictedTelemetryDispatcher', () => {
  it('filters runtimeContext for start events without mutating the source event', async () => {
    const onStart = vi.fn();
    const telemetryDispatcher = createRestrictedTelemetryDispatcher({
      telemetry: { integrations: { onStart } },
      sensitiveRuntimeContext,
    });

    const event = {
      runtimeContext,
    } as any;

    await telemetryDispatcher.onStart?.(event);

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeContext: { requestId: 'request-123' },
      }),
    );
    expect(event.runtimeContext).toEqual(runtimeContext);
  });

  it('filters runtimeContext for step start events and previous steps', async () => {
    const onStepStart = vi.fn();
    const telemetryDispatcher = createRestrictedTelemetryDispatcher({
      telemetry: { integrations: { onStepStart } },
      sensitiveRuntimeContext,
    });

    await telemetryDispatcher.onStepStart?.({
      runtimeContext,
      steps: [createStepResult()],
    } as any);

    const telemetryEvent = onStepStart.mock.calls[0][0];

    expect(telemetryEvent.runtimeContext).toEqual({
      requestId: 'request-123',
    });
    expect(telemetryEvent.steps[0].runtimeContext).toEqual({
      requestId: 'request-123',
    });
    expect(telemetryEvent.steps[0].text).toBe('Hello');
  });

  it('filters runtimeContext for step finish events', async () => {
    const onStepFinish = vi.fn();
    const telemetryDispatcher = createRestrictedTelemetryDispatcher({
      telemetry: { integrations: { onStepFinish } },
      sensitiveRuntimeContext,
    });

    await telemetryDispatcher.onStepFinish?.(createStepResult() as any);

    const telemetryEvent = onStepFinish.mock.calls[0][0];

    expect(telemetryEvent.runtimeContext).toEqual({
      requestId: 'request-123',
    });
    expect(telemetryEvent.text).toBe('Hello');
  });

  it('filters runtimeContext for finish events and all steps', async () => {
    const onFinish = vi.fn();
    const telemetryDispatcher = createRestrictedTelemetryDispatcher({
      telemetry: { integrations: { onFinish } },
      sensitiveRuntimeContext,
    });

    await telemetryDispatcher.onFinish?.({
      ...createStepResult(),
      text: 'Hello',
      runtimeContext,
      steps: [createStepResult()],
      totalUsage: createNullLanguageModelUsage(),
    } as any);

    const telemetryEvent = onFinish.mock.calls[0][0];

    expect(telemetryEvent.runtimeContext).toEqual({
      requestId: 'request-123',
    });
    expect(telemetryEvent.steps[0].runtimeContext).toEqual({
      requestId: 'request-123',
    });
    expect(telemetryEvent.text).toBe('Hello');
  });

  it('passes through executeTool without filtering', async () => {
    const executeTool = vi.fn(async ({ execute }) => execute());
    const telemetryDispatcher = createRestrictedTelemetryDispatcher({
      telemetry: { integrations: { executeTool } },
      sensitiveRuntimeContext,
    });

    await expect(
      telemetryDispatcher.executeTool?.({
        callId: 'call-1',
        toolCallId: 'tool-call-1',
        execute: async () => 'result',
      }),
    ).resolves.toBe('result');

    expect(executeTool).toHaveBeenCalledOnce();
  });
});
