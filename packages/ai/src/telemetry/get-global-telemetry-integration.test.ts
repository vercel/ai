import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TelemetryIntegration } from './telemetry-integration';
import {
  getGlobalTelemetryIntegration,
  bindTelemetryIntegration,
} from './get-global-telemetry-integration';
import { registerTelemetryIntegration } from './telemetry-integration-registry';

const dummyEvent = {} as any;

beforeEach(() => {
  globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
});

describe('getGlobalTelemetryIntegration', () => {
  it('returns no-op listeners when integrations is undefined and no global integrations', async () => {
    const listeners = getGlobalTelemetryIntegration()();

    expect(listeners.onStart).toBeDefined();
    expect(listeners.onStepStart).toBeDefined();
    expect(listeners.onToolCallStart).toBeDefined();
    expect(listeners.onToolCallFinish).toBeDefined();
    expect(listeners.onStepFinish).toBeDefined();
    expect(listeners.onFinish).toBeDefined();

    await expect(listeners.onStart!(dummyEvent)).resolves.toBeUndefined();
  });

  it('accepts a single integration (not wrapped in array)', async () => {
    const integration: TelemetryIntegration = {
      onStart: vi.fn(),
    };

    const listeners = getGlobalTelemetryIntegration()({
      integrations: integration,
    });

    expect(listeners.onStart).toBeDefined();
    await listeners.onStart!(dummyEvent);
    expect(integration.onStart).toHaveBeenCalledWith(dummyEvent);
  });

  it('accepts an array of integrations', () => {
    const integration1: TelemetryIntegration = { onStart: vi.fn() };
    const integration2: TelemetryIntegration = { onFinish: vi.fn() };

    const listeners = getGlobalTelemetryIntegration()({
      integrations: [integration1, integration2],
    });

    expect(listeners.onStart).toBeDefined();
    expect(listeners.onFinish).toBeDefined();
  });

  it('returns no-op for a lifecycle method no integration implements', async () => {
    const integration: TelemetryIntegration = { onStart: vi.fn() };

    const listeners = getGlobalTelemetryIntegration()({
      integrations: [integration],
    });

    expect(listeners.onToolCallStart).toBeDefined();
    expect(listeners.onToolCallFinish).toBeDefined();
    expect(listeners.onStepFinish).toBeDefined();
    expect(listeners.onFinish).toBeDefined();

    await expect(
      listeners.onToolCallStart!(dummyEvent),
    ).resolves.toBeUndefined();
  });

  it('broadcasts an event to all integrations that implement the method', async () => {
    const onStart1 = vi.fn();
    const onStart2 = vi.fn();
    const integration1: TelemetryIntegration = { onStart: onStart1 };
    const integration2: TelemetryIntegration = { onStart: onStart2 };

    const listeners = getGlobalTelemetryIntegration()({
      integrations: [integration1, integration2],
    });
    await listeners.onStart!(dummyEvent);

    expect(onStart1).toHaveBeenCalledWith(dummyEvent);
    expect(onStart2).toHaveBeenCalledWith(dummyEvent);
  });

  it('calls integrations in order', async () => {
    const callOrder: string[] = [];
    const integration1: TelemetryIntegration = {
      onFinish: async () => {
        callOrder.push('first');
      },
    };
    const integration2: TelemetryIntegration = {
      onFinish: async () => {
        callOrder.push('second');
      },
    };

    const listeners = getGlobalTelemetryIntegration()({
      integrations: [integration1, integration2],
    });
    await listeners.onFinish!(dummyEvent);

    expect(callOrder).toEqual(['first', 'second']);
  });

  it('skips integrations that do not implement the method', async () => {
    const onStart = vi.fn();
    const integration1: TelemetryIntegration = { onStart };
    const integration2: TelemetryIntegration = {};

    const listeners = getGlobalTelemetryIntegration()({
      integrations: [integration1, integration2],
    });
    await listeners.onStart!(dummyEvent);

    expect(onStart).toHaveBeenCalledOnce();
  });

  it('swallows errors from individual integrations without affecting others', async () => {
    const onStart1 = vi.fn().mockRejectedValue(new Error('boom'));
    const onStart2 = vi.fn();
    const integration1: TelemetryIntegration = { onStart: onStart1 };
    const integration2: TelemetryIntegration = { onStart: onStart2 };

    const listeners = getGlobalTelemetryIntegration()({
      integrations: [integration1, integration2],
    });
    await listeners.onStart!(dummyEvent);

    expect(onStart1).toHaveBeenCalledWith(dummyEvent);
    expect(onStart2).toHaveBeenCalledWith(dummyEvent);
  });

  it('swallows sync errors thrown by integrations', async () => {
    const integration: TelemetryIntegration = {
      onStart: () => {
        throw new Error('sync boom');
      },
    };

    const listeners = getGlobalTelemetryIntegration()({
      integrations: [integration],
    });

    await expect(listeners.onStart!(dummyEvent)).resolves.toBeUndefined();
  });

  it('works with all lifecycle methods', async () => {
    const integration: TelemetryIntegration = {
      onStart: vi.fn(),
      onStepStart: vi.fn(),
      onToolCallStart: vi.fn(),
      onToolCallFinish: vi.fn(),
      onStepFinish: vi.fn(),
      onFinish: vi.fn(),
    };

    const listeners = getGlobalTelemetryIntegration()({
      integrations: [integration],
    });

    await listeners.onStart!(dummyEvent);
    await listeners.onStepStart!(dummyEvent);
    await listeners.onToolCallStart!(dummyEvent);
    await listeners.onToolCallFinish!(dummyEvent);
    await listeners.onStepFinish!(dummyEvent);
    await listeners.onFinish!(dummyEvent);

    expect(integration.onStart).toHaveBeenCalledOnce();
    expect(integration.onStepStart).toHaveBeenCalledOnce();
    expect(integration.onToolCallStart).toHaveBeenCalledOnce();
    expect(integration.onToolCallFinish).toHaveBeenCalledOnce();
    expect(integration.onStepFinish).toHaveBeenCalledOnce();
    expect(integration.onFinish).toHaveBeenCalledOnce();
  });

  it('handles an empty array of integrations', async () => {
    const listeners = getGlobalTelemetryIntegration()({ integrations: [] });

    expect(listeners.onStart).toBeDefined();
    expect(listeners.onFinish).toBeDefined();

    await expect(listeners.onStart!(dummyEvent)).resolves.toBeUndefined();
  });

  describe('global integration merging', () => {
    it('includes globally registered integrations when no local integrations are provided', async () => {
      const onStart = vi.fn();
      registerTelemetryIntegration({ onStart });

      const listeners = getGlobalTelemetryIntegration()();
      await listeners.onStart!(dummyEvent);

      expect(onStart).toHaveBeenCalledWith(dummyEvent);
    });

    it('merges global and local integrations', async () => {
      const globalOnStart = vi.fn();
      const localOnStart = vi.fn();

      registerTelemetryIntegration({ onStart: globalOnStart });

      const listeners = getGlobalTelemetryIntegration()({
        integrations: { onStart: localOnStart },
      });
      await listeners.onStart!(dummyEvent);

      expect(globalOnStart).toHaveBeenCalledWith(dummyEvent);
      expect(localOnStart).toHaveBeenCalledWith(dummyEvent);
    });

    it('calls global integrations before local integrations', async () => {
      const callOrder: string[] = [];

      registerTelemetryIntegration({
        onFinish: async () => {
          callOrder.push('global');
        },
      });

      const listeners = getGlobalTelemetryIntegration()({
        integrations: {
          onFinish: async () => {
            callOrder.push('local');
          },
        },
      });
      await listeners.onFinish!(dummyEvent);

      expect(callOrder).toEqual(['global', 'local']);
    });

    it('global integrations work with local integration arrays', async () => {
      const globalOnStart = vi.fn();
      const localOnStart1 = vi.fn();
      const localOnStart2 = vi.fn();

      registerTelemetryIntegration({ onStart: globalOnStart });

      const listeners = getGlobalTelemetryIntegration()({
        integrations: [{ onStart: localOnStart1 }, { onStart: localOnStart2 }],
      });
      await listeners.onStart!(dummyEvent);

      expect(globalOnStart).toHaveBeenCalledWith(dummyEvent);
      expect(localOnStart1).toHaveBeenCalledWith(dummyEvent);
      expect(localOnStart2).toHaveBeenCalledWith(dummyEvent);
    });

    it('errors in global integrations do not affect local integrations', async () => {
      registerTelemetryIntegration({
        onStart: () => {
          throw new Error('global boom');
        },
      });

      const localOnStart = vi.fn();
      const listeners = getGlobalTelemetryIntegration()({
        integrations: { onStart: localOnStart },
      });
      await listeners.onStart!(dummyEvent);

      expect(localOnStart).toHaveBeenCalledWith(dummyEvent);
    });

    it('auto-binds class-based global integrations', async () => {
      class ClassGlobalIntegration implements TelemetryIntegration {
        calls = 0;

        onStart() {
          this.calls += 1;
        }
      }

      const integration = new ClassGlobalIntegration();
      registerTelemetryIntegration(integration);

      const listeners = getGlobalTelemetryIntegration()();
      await listeners.onStart!(dummyEvent);

      expect(integration.calls).toBe(1);
    });
  });
});

describe('bindTelemetryIntegration', () => {
  it('preserves this context for class-based integrations', async () => {
    class MyIntegration implements TelemetryIntegration {
      value = '';

      async onStart() {
        this.value = 'called';
      }
    }

    const instance = new MyIntegration();
    const bound = bindTelemetryIntegration(instance);

    const { onStart } = bound;
    await onStart!(dummyEvent);
    expect(instance.value).toBe('called');
  });

  it('returns undefined for methods the integration does not implement', () => {
    const integration: TelemetryIntegration = { onStart: vi.fn() };
    const bound = bindTelemetryIntegration(integration);

    expect(bound.onStart).toBeDefined();
    expect(bound.onStepStart).toBeUndefined();
    expect(bound.onToolCallStart).toBeUndefined();
    expect(bound.onToolCallFinish).toBeUndefined();
    expect(bound.onStepFinish).toBeUndefined();
    expect(bound.onFinish).toBeUndefined();
  });

  it('bound integration works correctly with getGlobalTelemetryIntegration', async () => {
    class DevToolsTelemetry implements TelemetryIntegration {
      calls: string[] = [];

      async onStart() {
        this.calls.push('start');
      }

      async onFinish() {
        this.calls.push('finish');
      }
    }

    const instance = new DevToolsTelemetry();
    const bound = bindTelemetryIntegration(instance);
    const listeners = getGlobalTelemetryIntegration()({
      integrations: [bound],
    });

    await listeners.onStart!(dummyEvent);
    await listeners.onFinish!(dummyEvent);

    expect(instance.calls).toEqual(['start', 'finish']);
  });
});
