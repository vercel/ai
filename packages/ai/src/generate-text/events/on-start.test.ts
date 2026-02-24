import { describe, it, expect } from 'vitest';
import { notifyOnStart } from './on-start';
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
  describe('notifyOnStart', () => {
    it('should call a single callback with the event', async () => {
      const calls: string[] = [];
      const event = createMockOnStartEvent();

      await notifyOnStart({
        event,
        callbacks: () => {
          calls.push('listener called');
        },
      });

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener called",
        ]
      `);
    });

    it('should call all callbacks when given an array', async () => {
      const calls: string[] = [];
      const event = createMockOnStartEvent();

      await notifyOnStart({
        event,
        callbacks: [
          () => {
            calls.push('listener 1');
          },
          () => {
            calls.push('listener 2');
          },
          () => {
            calls.push('listener 3');
          },
        ],
      });

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 1",
          "listener 2",
          "listener 3",
        ]
      `);
    });

    it('should work with undefined callbacks', async () => {
      await expect(
        notifyOnStart({
          event: createMockOnStartEvent(),
          callbacks: undefined,
        }),
      ).resolves.toBeUndefined();
    });

    it('should work with omitted callbacks', async () => {
      await expect(
        notifyOnStart({
          event: createMockOnStartEvent(),
        }),
      ).resolves.toBeUndefined();
    });

    it('should await async callbacks', async () => {
      const callOrder: string[] = [];
      const event = createMockOnStartEvent();

      await notifyOnStart({
        event,
        callbacks: async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          callOrder.push('async callback completed');
        },
      });

      callOrder.push('after notifyOnStart');

      expect(callOrder).toMatchInlineSnapshot(`
        [
          "async callback completed",
          "after notifyOnStart",
        ]
      `);
    });

    it('should swallow errors in a single callback', async () => {
      const calls: string[] = [];
      const event = createMockOnStartEvent();

      await notifyOnStart({
        event,
        callbacks: () => {
          calls.push('before throw');
          throw new Error('callback error');
        },
      });

      calls.push('after notifyOnStart');

      expect(calls).toMatchInlineSnapshot(`
        [
          "before throw",
          "after notifyOnStart",
        ]
      `);
    });

    it('should swallow errors in array and continue with subsequent callbacks', async () => {
      const calls: string[] = [];
      const event = createMockOnStartEvent();

      await notifyOnStart({
        event,
        callbacks: [
          () => {
            calls.push('listener 1 before throw');
            throw new Error('listener 1 error');
          },
          () => {
            calls.push('listener 2');
          },
        ],
      });

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 1 before throw",
          "listener 2",
        ]
      `);
    });

    it('should pass event data to callbacks', async () => {
      const receivedEvents: Array<{
        provider: string;
        modelId: string;
        temperature: number | undefined;
      }> = [];
      const event = createMockOnStartEvent({
        model: { provider: 'openai', modelId: 'gpt-4o' },
        temperature: 0.5,
      });

      await notifyOnStart({
        event,
        callbacks: ev => {
          receivedEvents.push({
            provider: ev.model.provider,
            modelId: ev.model.modelId,
            temperature: ev.temperature,
          });
        },
      });

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

    it('should propagate model info, temperature, and other event fields', async () => {
      const receivedData: Array<{
        provider: string;
        modelId: string;
        temperature: number | undefined;
        maxRetries: number;
      }> = [];
      const event = createMockOnStartEvent({
        model: { provider: 'anthropic', modelId: 'claude-3' },
        temperature: 0.9,
        maxRetries: 5,
      });

      await notifyOnStart({
        event,
        callbacks: ev => {
          receivedData.push({
            provider: ev.model.provider,
            modelId: ev.model.modelId,
            temperature: ev.temperature,
            maxRetries: ev.maxRetries,
          });
        },
      });

      expect(receivedData).toMatchInlineSnapshot(`
        [
          {
            "maxRetries": 5,
            "modelId": "claude-3",
            "provider": "anthropic",
            "temperature": 0.9,
          },
        ]
      `);
    });

    it('should provide typed event properties to callbacks', async () => {
      const event = createMockOnStartEvent();

      await notifyOnStart({
        event,
        callbacks: ev => {
          const _model: { provider: string; modelId: string } = ev.model;
          const _temperature: number | undefined = ev.temperature;
          const _prompt: string | undefined = ev.prompt as string | undefined;
          const _maxRetries: number = ev.maxRetries;

          expect(_model).toBeDefined();
          expect(typeof _maxRetries).toBe('number');
        },
      });
    });
  });
});
