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

const toolsContext = {
  weather: {
    apiKey: 'secret-api-key',
    city: 'Berlin',
  },
  stocks: {
    symbol: 'AI',
  },
};

const filteredToolsContext = {
  weather: { city: 'Berlin' },
  stocks: { symbol: 'AI' },
};

const tools = {
  weather: {
    sensitiveContext: {
      apiKey: true,
      city: false,
    },
  },
  stocks: {
    sensitiveContext: undefined,
  },
} as any;

function createStepResult({
  context = runtimeContext,
  toolContexts = {},
}: {
  context?: typeof runtimeContext;
  toolContexts?: Record<string, unknown>;
} = {}) {
  return new DefaultStepResult({
    callId: 'call-1',
    stepNumber: 0,
    provider: 'test-provider',
    modelId: 'test-model',
    runtimeContext: context,
    toolsContext: toolContexts,
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

  it('filters toolsContext per tool for start events without mutating the source event', async () => {
    const onStart = vi.fn();
    const telemetryDispatcher = createRestrictedTelemetryDispatcher({
      telemetry: { integrations: { onStart } },
      tools,
      sensitiveRuntimeContext: undefined,
    });

    const event = {
      runtimeContext,
      toolsContext,
    } as any;

    await telemetryDispatcher.onStart?.(event);

    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        toolsContext: filteredToolsContext,
      }),
    );
    expect(event.toolsContext).toEqual(toolsContext);
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

  it('filters toolsContext for step start events and previous steps', async () => {
    const onStepStart = vi.fn();
    const telemetryDispatcher = createRestrictedTelemetryDispatcher({
      telemetry: { integrations: { onStepStart } },
      tools,
      sensitiveRuntimeContext: undefined,
    });
    const previousStep = createStepResult({ toolContexts: toolsContext });

    await telemetryDispatcher.onStepStart?.({
      runtimeContext,
      toolsContext,
      steps: [previousStep],
    } as any);

    const telemetryEvent = onStepStart.mock.calls[0][0];

    expect(telemetryEvent.toolsContext).toEqual(filteredToolsContext);
    expect(telemetryEvent.steps[0].toolsContext).toEqual(filteredToolsContext);
    expect(previousStep.toolsContext).toEqual(toolsContext);
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

  it('filters toolsContext for step finish events without mutating the source step', async () => {
    const onStepFinish = vi.fn();
    const telemetryDispatcher = createRestrictedTelemetryDispatcher({
      telemetry: { integrations: { onStepFinish } },
      tools,
      sensitiveRuntimeContext: undefined,
    });
    const step = createStepResult({ toolContexts: toolsContext });

    await telemetryDispatcher.onStepFinish?.(step as any);

    const telemetryEvent = onStepFinish.mock.calls[0][0];

    expect(telemetryEvent.toolsContext).toEqual(filteredToolsContext);
    expect(telemetryEvent.text).toBe('Hello');
    expect(step.toolsContext).toEqual(toolsContext);
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

  it('filters toolsContext for finish events and all steps without mutating source steps', async () => {
    const onFinish = vi.fn();
    const telemetryDispatcher = createRestrictedTelemetryDispatcher({
      telemetry: { integrations: { onFinish } },
      tools,
      sensitiveRuntimeContext: undefined,
    });
    const step = createStepResult({ toolContexts: toolsContext });

    await telemetryDispatcher.onFinish?.({
      ...createStepResult({ toolContexts: toolsContext }),
      text: 'Hello',
      runtimeContext,
      toolsContext,
      steps: [step],
      totalUsage: createNullLanguageModelUsage(),
    } as any);

    const telemetryEvent = onFinish.mock.calls[0][0];

    expect(telemetryEvent.toolsContext).toEqual(filteredToolsContext);
    expect(telemetryEvent.steps[0].toolsContext).toEqual(filteredToolsContext);
    expect(telemetryEvent.text).toBe('Hello');
    expect(step.toolsContext).toEqual(toolsContext);
  });

  it('filters tool execution start events without mutating the source event', async () => {
    const onToolExecutionStart = vi.fn();
    const telemetryDispatcher = createRestrictedTelemetryDispatcher({
      telemetry: { integrations: { onToolExecutionStart } },
      tools,
      sensitiveRuntimeContext,
    });
    const event = {
      callId: 'call-1',
      messages: [],
      toolCall: {
        type: 'tool-call',
        toolCallId: 'tool-call-1',
        toolName: 'weather',
        input: { value: 'input' },
      },
      toolContext: toolsContext.weather,
    };

    await telemetryDispatcher.onToolExecutionStart?.(event as any);

    expect(onToolExecutionStart).toHaveBeenCalledWith(
      expect.objectContaining({
        ...event,
        toolContext: filteredToolsContext.weather,
      }),
    );
    expect(event.toolContext).toEqual(toolsContext.weather);
  });

  it('filters tool execution end events without mutating the source event', async () => {
    const onToolExecutionEnd = vi.fn();
    const telemetryDispatcher = createRestrictedTelemetryDispatcher({
      telemetry: { integrations: { onToolExecutionEnd } },
      tools,
      sensitiveRuntimeContext,
    });
    const event = {
      callId: 'call-1',
      durationMs: 10,
      messages: [],
      toolCall: {
        type: 'tool-call',
        toolCallId: 'tool-call-1',
        toolName: 'weather',
        input: { value: 'input' },
      },
      toolContext: toolsContext.weather,
      toolOutput: {
        type: 'tool-result',
        toolCallId: 'tool-call-1',
        toolName: 'weather',
        output: { value: 'output' },
      },
    };

    await telemetryDispatcher.onToolExecutionEnd?.(event as any);

    expect(onToolExecutionEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        ...event,
        toolContext: filteredToolsContext.weather,
      }),
    );
    expect(event.toolContext).toEqual(toolsContext.weather);
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
