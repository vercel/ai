import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { listenOnStart, notifyOnStart } from './on-start';
import type { OnStartEvent } from '../callback-events';

function createMockOnStartEvent(
  overrides: Partial<OnStartEvent> = {},
): OnStartEvent {
  return {
    model: { provider: 'test-provider', modelId: 'test-model' },
    system: undefined,
    prompt: 'test prompt',
    messages: undefined,
    tools: undefined,
    toolChoice: undefined,
    activeTools: undefined,
    maxOutputTokens: undefined,
    temperature: 0.7,
    topP: undefined,
    topK: undefined,
    presencePenalty: undefined,
    frequencyPenalty: undefined,
    stopSequences: undefined,
    seed: undefined,
    maxRetries: 3,
    timeout: undefined,
    headers: undefined,
    providerOptions: undefined,
    stopWhen: undefined,
    output: undefined,
    abortSignal: undefined,
    include: undefined,
    functionId: undefined,
    metadata: undefined,
    experimental_context: undefined,
    ...overrides,
  };
}

describe('on-start', () => {
  let unsubscribers: Array<() => void>;

  beforeEach(() => {
    unsubscribers = [];
  });

  afterEach(() => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  });

  describe('listenOnStart', () => {
    it('should register a listener and return an unsubscribe function', async () => {
      const calls: string[] = [];

      const unsubscribe = listenOnStart(() => {
        calls.push('listener called');
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStart(createMockOnStartEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener called",
        ]
      `);
    });

    it('should allow multiple listeners to be registered', async () => {
      const calls: string[] = [];

      const unsubscribe1 = listenOnStart(() => {
        calls.push('listener 1');
      });
      const unsubscribe2 = listenOnStart(() => {
        calls.push('listener 2');
      });
      const unsubscribe3 = listenOnStart(() => {
        calls.push('listener 3');
      });
      unsubscribers.push(unsubscribe1, unsubscribe2, unsubscribe3);

      await notifyOnStart(createMockOnStartEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 1",
          "listener 2",
          "listener 3",
        ]
      `);
    });

    it('should remove listener when unsubscribe is called', async () => {
      const calls: string[] = [];

      const unsubscribe1 = listenOnStart(() => {
        calls.push('listener 1');
      });
      const unsubscribe2 = listenOnStart(() => {
        calls.push('listener 2');
      });
      unsubscribers.push(unsubscribe1, unsubscribe2);

      await notifyOnStart(createMockOnStartEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 1",
          "listener 2",
        ]
      `);

      calls.length = 0;
      unsubscribe1();

      await notifyOnStart(createMockOnStartEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 2",
        ]
      `);
    });

    it('should handle unsubscribe called multiple times gracefully', async () => {
      const calls: string[] = [];

      const unsubscribe = listenOnStart(() => {
        calls.push('listener');
      });

      await notifyOnStart(createMockOnStartEvent());
      expect(calls).toMatchInlineSnapshot(`
        [
          "listener",
        ]
      `);

      unsubscribe();
      unsubscribe();
      unsubscribe();

      calls.length = 0;
      await notifyOnStart(createMockOnStartEvent());

      expect(calls).toMatchInlineSnapshot(`[]`);
    });
  });

  describe('notifyOnStart', () => {
    it('should pass event data to listeners', async () => {
      const receivedEvents: Array<{
        provider: string;
        modelId: string;
        temperature: number | undefined;
      }> = [];

      const unsubscribe = listenOnStart(event => {
        receivedEvents.push({
          provider: event.model.provider,
          modelId: event.model.modelId,
          temperature: event.temperature,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStart(
        createMockOnStartEvent({
          model: { provider: 'openai', modelId: 'gpt-4o' },
          temperature: 0.5,
        }),
      );

      expect(receivedEvents).toMatchInlineSnapshot(`
        [
          {
            "modelId": "gpt-4o",
            "provider": "openai",
            "temperature": 0.5,
          },
        ]
      `);
    });

    it('should call the optional callback after listeners', async () => {
      const callOrder: string[] = [];

      const unsubscribe = listenOnStart(() => {
        callOrder.push('listener');
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStart(createMockOnStartEvent(), () => {
        callOrder.push('callback');
      });

      expect(callOrder).toMatchInlineSnapshot(`
        [
          "listener",
          "callback",
        ]
      `);
    });

    it('should await async callbacks', async () => {
      const callOrder: string[] = [];

      await notifyOnStart(createMockOnStartEvent(), async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        callOrder.push('async callback completed');
      });

      callOrder.push('after notifyOnStart');

      expect(callOrder).toMatchInlineSnapshot(`
        [
          "async callback completed",
          "after notifyOnStart",
        ]
      `);
    });

    it('should catch errors in listeners without breaking', async () => {
      const calls: string[] = [];

      const unsubscribe1 = listenOnStart(() => {
        calls.push('listener 1 before throw');
        throw new Error('listener 1 error');
      });
      const unsubscribe2 = listenOnStart(() => {
        calls.push('listener 2');
      });
      unsubscribers.push(unsubscribe1, unsubscribe2);

      await notifyOnStart(createMockOnStartEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 1 before throw",
          "listener 2",
        ]
      `);
    });

    it('should catch errors in callback without breaking', async () => {
      const calls: string[] = [];

      const unsubscribe = listenOnStart(() => {
        calls.push('listener');
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStart(createMockOnStartEvent(), () => {
        calls.push('callback before throw');
        throw new Error('callback error');
      });

      calls.push('after notifyOnStart');

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener",
          "callback before throw",
          "after notifyOnStart",
        ]
      `);
    });

    it('should work with no listeners registered', async () => {
      const calls: string[] = [];

      await notifyOnStart(createMockOnStartEvent(), () => {
        calls.push('callback');
      });

      expect(calls).toMatchInlineSnapshot(`
        [
          "callback",
        ]
      `);
    });

    it('should work with no callback provided', async () => {
      const calls: string[] = [];

      const unsubscribe = listenOnStart(() => {
        calls.push('listener');
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStart(createMockOnStartEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener",
        ]
      `);
    });

    it('should work with neither listeners nor callback', async () => {
      await expect(
        notifyOnStart(createMockOnStartEvent()),
      ).resolves.toBeUndefined();
    });
  });

  describe('type safety', () => {
    it('should provide typed event properties to listeners', async () => {
      const unsubscribe = listenOnStart(event => {
        const _model: { provider: string; modelId: string } = event.model;
        const _temperature: number | undefined = event.temperature;
        const _prompt: string | undefined = event.prompt as string | undefined;
        const _maxRetries: number = event.maxRetries;

        expect(_model).toBeDefined();
        expect(typeof _maxRetries).toBe('number');
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStart(createMockOnStartEvent());
    });

    it('should preserve event data through callback', async () => {
      const mockEvent = createMockOnStartEvent({
        model: { provider: 'anthropic', modelId: 'claude-3' },
        temperature: 0.9,
        maxRetries: 5,
      });

      const receivedData: Array<{
        provider: string;
        modelId: string;
        temperature: number | undefined;
      }> = [];

      await notifyOnStart(mockEvent, event => {
        receivedData.push({
          provider: event.model.provider,
          modelId: event.model.modelId,
          temperature: event.temperature,
        });
      });

      expect(receivedData).toMatchInlineSnapshot(`
        [
          {
            "modelId": "claude-3",
            "provider": "anthropic",
            "temperature": 0.9,
          },
        ]
      `);
    });
  });
});
