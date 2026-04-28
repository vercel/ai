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
  it('passes through runtimeContext unchanged when no sensitive context is configured', async () => {
    const onStart = vi.fn();
    const telemetryDispatcher = createRestrictedTelemetryDispatcher({
      telemetry: { integrations: { onStart } },
      sensitiveRuntimeContext: undefined,
    });

    await telemetryDispatcher.onStart?.({ runtimeContext } as any);

    const telemetryEvent = onStart.mock.calls[0][0];

    expect(telemetryEvent.runtimeContext).toBe(runtimeContext);
    expect(telemetryEvent.runtimeContext).toEqual({
      userId: 'user-123',
      requestId: 'request-123',
    });
  });

  it('only filters runtimeContext properties marked as true', async () => {
    const onStart = vi.fn();
    const telemetryDispatcher = createRestrictedTelemetryDispatcher({
      telemetry: { integrations: { onStart } },
      sensitiveRuntimeContext: {
        userId: true,
        requestId: false,
      },
    });

    await telemetryDispatcher.onStart?.({ runtimeContext } as any);

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeContext: { requestId: 'request-123' },
      }),
    );
  });

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
    const previousStep = createStepResult();

    await telemetryDispatcher.onStepStart?.({
      runtimeContext,
      steps: [previousStep],
    } as any);

    const telemetryEvent = onStepStart.mock.calls[0][0];

    expect(telemetryEvent.runtimeContext).toEqual({
      requestId: 'request-123',
    });
    expect(telemetryEvent.steps[0].runtimeContext).toEqual({
      requestId: 'request-123',
    });
    expect(telemetryEvent.steps[0].text).toBe('Hello');
    expect(previousStep.runtimeContext).toEqual(runtimeContext);
  });

  it('filters runtimeContext for step finish events without mutating the source step', async () => {
    const onStepFinish = vi.fn();
    const telemetryDispatcher = createRestrictedTelemetryDispatcher({
      telemetry: { integrations: { onStepFinish } },
      sensitiveRuntimeContext,
    });
    const step = createStepResult();

    await telemetryDispatcher.onStepFinish?.(step as any);

    const telemetryEvent = onStepFinish.mock.calls[0][0];

    expect(telemetryEvent.runtimeContext).toEqual({
      requestId: 'request-123',
    });
    expect(telemetryEvent.text).toBe('Hello');
    expect(step.runtimeContext).toEqual(runtimeContext);
  });

  it('filters runtimeContext for finish events and all steps without mutating source steps', async () => {
    const onFinish = vi.fn();
    const telemetryDispatcher = createRestrictedTelemetryDispatcher({
      telemetry: { integrations: { onFinish } },
      sensitiveRuntimeContext,
    });
    const step = createStepResult();

    await telemetryDispatcher.onFinish?.({
      ...createStepResult(),
      text: 'Hello',
      runtimeContext,
      steps: [step],
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
    expect(step.runtimeContext).toEqual(runtimeContext);
  });

  it('passes through tool execution start events without filtering', async () => {
    const onToolExecutionStart = vi.fn();
    const telemetryDispatcher = createRestrictedTelemetryDispatcher({
      telemetry: { integrations: { onToolExecutionStart } },
      sensitiveRuntimeContext,
    });
    const event = {
      callId: 'call-1',
      messages: [],
      toolCall: {
        type: 'tool-call',
        toolCallId: 'tool-call-1',
        toolName: 'testTool',
        input: { value: 'input' },
      },
      toolContext: { userId: 'user-123' },
    };

    await telemetryDispatcher.onToolExecutionStart?.(event as any);

    expect(onToolExecutionStart).toHaveBeenCalledWith(
      expect.objectContaining(event),
    );
  });

  it('passes through tool execution end events without filtering', async () => {
    const onToolExecutionEnd = vi.fn();
    const telemetryDispatcher = createRestrictedTelemetryDispatcher({
      telemetry: { integrations: { onToolExecutionEnd } },
      sensitiveRuntimeContext,
    });
    const event = {
      callId: 'call-1',
      durationMs: 10,
      messages: [],
      toolCall: {
        type: 'tool-call',
        toolCallId: 'tool-call-1',
        toolName: 'testTool',
        input: { value: 'input' },
      },
      toolContext: { userId: 'user-123' },
      toolOutput: {
        type: 'tool-result',
        toolCallId: 'tool-call-1',
        toolName: 'testTool',
        output: { value: 'output' },
      },
    };

    await telemetryDispatcher.onToolExecutionEnd?.(event as any);

    expect(onToolExecutionEnd).toHaveBeenCalledWith(
      expect.objectContaining(event),
    );
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
