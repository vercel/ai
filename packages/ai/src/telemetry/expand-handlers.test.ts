import { describe, it, expect, vi } from 'vitest';
import type { TelemetryHandler } from './telemetry-handler';
import { expandHandlers, bindTelemetryHandler } from './expand-handlers';

const dummyEvent = {} as any;

describe('expandHandlers', () => {
  it('returns all undefined listeners when handlers is undefined', () => {
    const listeners = expandHandlers(undefined);

    expect(listeners.onStart).toBeUndefined();
    expect(listeners.onStepStart).toBeUndefined();
    expect(listeners.onToolCallStart).toBeUndefined();
    expect(listeners.onToolCallFinish).toBeUndefined();
    expect(listeners.onStepFinish).toBeUndefined();
    expect(listeners.onFinish).toBeUndefined();
  });

  it('accepts a single handler (not wrapped in array)', () => {
    const handler: TelemetryHandler = {
      onStart: vi.fn(),
    };

    const listeners = expandHandlers(handler);

    expect(listeners.onStart).toBeDefined();
    expect(listeners.onStepStart).toBeUndefined();
  });

  it('accepts an array of handlers', () => {
    const handler1: TelemetryHandler = { onStart: vi.fn() };
    const handler2: TelemetryHandler = { onFinish: vi.fn() };

    const listeners = expandHandlers([handler1, handler2]);

    expect(listeners.onStart).toBeDefined();
    expect(listeners.onFinish).toBeDefined();
  });

  it('returns undefined for a lifecycle method no handler implements', () => {
    const handler: TelemetryHandler = { onStart: vi.fn() };

    const listeners = expandHandlers([handler]);

    expect(listeners.onToolCallStart).toBeUndefined();
    expect(listeners.onToolCallFinish).toBeUndefined();
    expect(listeners.onStepFinish).toBeUndefined();
    expect(listeners.onFinish).toBeUndefined();
  });

  it('broadcasts an event to all handlers that implement the method', async () => {
    const onStart1 = vi.fn();
    const onStart2 = vi.fn();
    const handler1: TelemetryHandler = { onStart: onStart1 };
    const handler2: TelemetryHandler = { onStart: onStart2 };

    const listeners = expandHandlers([handler1, handler2]);
    await listeners.onStart!(dummyEvent);

    expect(onStart1).toHaveBeenCalledWith(dummyEvent);
    expect(onStart2).toHaveBeenCalledWith(dummyEvent);
  });

  it('calls handlers in order', async () => {
    const callOrder: string[] = [];
    const handler1: TelemetryHandler = {
      onFinish: async () => {
        callOrder.push('first');
      },
    };
    const handler2: TelemetryHandler = {
      onFinish: async () => {
        callOrder.push('second');
      },
    };

    const listeners = expandHandlers([handler1, handler2]);
    await listeners.onFinish!(dummyEvent);

    expect(callOrder).toEqual(['first', 'second']);
  });

  it('skips handlers that do not implement the method', async () => {
    const onStart = vi.fn();
    const handler1: TelemetryHandler = { onStart };
    const handler2: TelemetryHandler = {};

    const listeners = expandHandlers([handler1, handler2]);
    await listeners.onStart!(dummyEvent);

    expect(onStart).toHaveBeenCalledOnce();
  });

  it('swallows errors from individual handlers without affecting others', async () => {
    const onStart1 = vi.fn().mockRejectedValue(new Error('boom'));
    const onStart2 = vi.fn();
    const handler1: TelemetryHandler = { onStart: onStart1 };
    const handler2: TelemetryHandler = { onStart: onStart2 };

    const listeners = expandHandlers([handler1, handler2]);
    await listeners.onStart!(dummyEvent);

    expect(onStart1).toHaveBeenCalledWith(dummyEvent);
    expect(onStart2).toHaveBeenCalledWith(dummyEvent);
  });

  it('swallows sync errors thrown by handlers', async () => {
    const handler: TelemetryHandler = {
      onStart: () => {
        throw new Error('sync boom');
      },
    };

    const listeners = expandHandlers([handler]);

    await expect(listeners.onStart!(dummyEvent)).resolves.toBeUndefined();
  });

  it('works with all lifecycle methods', async () => {
    const handler: TelemetryHandler = {
      onStart: vi.fn(),
      onStepStart: vi.fn(),
      onToolCallStart: vi.fn(),
      onToolCallFinish: vi.fn(),
      onStepFinish: vi.fn(),
      onFinish: vi.fn(),
    };

    const listeners = expandHandlers([handler]);

    await listeners.onStart!(dummyEvent);
    await listeners.onStepStart!(dummyEvent);
    await listeners.onToolCallStart!(dummyEvent);
    await listeners.onToolCallFinish!(dummyEvent);
    await listeners.onStepFinish!(dummyEvent);
    await listeners.onFinish!(dummyEvent);

    expect(handler.onStart).toHaveBeenCalledOnce();
    expect(handler.onStepStart).toHaveBeenCalledOnce();
    expect(handler.onToolCallStart).toHaveBeenCalledOnce();
    expect(handler.onToolCallFinish).toHaveBeenCalledOnce();
    expect(handler.onStepFinish).toHaveBeenCalledOnce();
    expect(handler.onFinish).toHaveBeenCalledOnce();
  });

  it('handles an empty array of handlers', () => {
    const listeners = expandHandlers([]);

    expect(listeners.onStart).toBeUndefined();
    expect(listeners.onFinish).toBeUndefined();
  });
});

describe('bindTelemetryHandler', () => {
  it('preserves this context for class-based handlers', async () => {
    class MyHandler implements TelemetryHandler {
      value = '';

      async onStart() {
        this.value = 'called';
      }
    }

    const instance = new MyHandler();
    const bound = bindTelemetryHandler(instance);

    const { onStart } = bound;
    await onStart!(dummyEvent);
    expect(instance.value).toBe('called');
  });

  it('returns undefined for methods the handler does not implement', () => {
    const handler: TelemetryHandler = { onStart: vi.fn() };
    const bound = bindTelemetryHandler(handler);

    expect(bound.onStart).toBeDefined();
    expect(bound.onStepStart).toBeUndefined();
    expect(bound.onToolCallStart).toBeUndefined();
    expect(bound.onToolCallFinish).toBeUndefined();
    expect(bound.onStepFinish).toBeUndefined();
    expect(bound.onFinish).toBeUndefined();
  });

  it('bound handler works correctly with expandHandlers', async () => {
    class DevToolsHandler implements TelemetryHandler {
      calls: string[] = [];

      async onStart() {
        this.calls.push('start');
      }

      async onFinish() {
        this.calls.push('finish');
      }
    }

    const instance = new DevToolsHandler();
    const bound = bindTelemetryHandler(instance);
    const listeners = expandHandlers([bound]);

    await listeners.onStart!(dummyEvent);
    await listeners.onFinish!(dummyEvent);

    expect(instance.calls).toEqual(['start', 'finish']);
  });
});
