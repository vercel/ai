import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { listenOnStepStart, notifyOnStepStart } from './on-step-start';
import type { OnStepStartEvent } from '../callback-events';

function createMockOnStepStartEvent(
  overrides: Partial<OnStepStartEvent> = {},
): OnStepStartEvent {
  return {
    stepNumber: 0,
    model: { provider: 'test-provider', modelId: 'test-model' },
    system: undefined,
    messages: [{ role: 'user', content: 'test message' }],
    tools: undefined,
    toolChoice: undefined,
    activeTools: undefined,
    steps: [],
    providerOptions: undefined,
    timeout: undefined,
    headers: undefined,
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

describe('on-step-start', () => {
  let unsubscribers: Array<() => void>;

  beforeEach(() => {
    unsubscribers = [];
  });

  afterEach(() => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  });

  describe('listenOnStepStart', () => {
    it('should register a listener and return an unsubscribe function', async () => {
      const calls: string[] = [];

      const unsubscribe = listenOnStepStart(() => {
        calls.push('listener called');
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStepStart(createMockOnStepStartEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener called",
        ]
      `);
    });

    it('should allow multiple listeners to be registered', async () => {
      const calls: string[] = [];

      const unsubscribe1 = listenOnStepStart(() => {
        calls.push('listener 1');
      });
      const unsubscribe2 = listenOnStepStart(() => {
        calls.push('listener 2');
      });
      const unsubscribe3 = listenOnStepStart(() => {
        calls.push('listener 3');
      });
      unsubscribers.push(unsubscribe1, unsubscribe2, unsubscribe3);

      await notifyOnStepStart(createMockOnStepStartEvent());

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

      const unsubscribe1 = listenOnStepStart(() => {
        calls.push('listener 1');
      });
      const unsubscribe2 = listenOnStepStart(() => {
        calls.push('listener 2');
      });
      unsubscribers.push(unsubscribe1, unsubscribe2);

      await notifyOnStepStart(createMockOnStepStartEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 1",
          "listener 2",
        ]
      `);

      calls.length = 0;
      unsubscribe1();

      await notifyOnStepStart(createMockOnStepStartEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 2",
        ]
      `);
    });

    it('should handle unsubscribe called multiple times gracefully', async () => {
      const calls: string[] = [];

      const unsubscribe = listenOnStepStart(() => {
        calls.push('listener');
      });

      await notifyOnStepStart(createMockOnStepStartEvent());
      expect(calls).toMatchInlineSnapshot(`
        [
          "listener",
        ]
      `);

      unsubscribe();
      unsubscribe();
      unsubscribe();

      calls.length = 0;
      await notifyOnStepStart(createMockOnStepStartEvent());

      expect(calls).toMatchInlineSnapshot(`[]`);
    });
  });

  describe('notifyOnStepStart', () => {
    it('should pass event data to listeners', async () => {
      const receivedEvents: Array<{
        stepNumber: number;
        provider: string;
        modelId: string;
        messageCount: number;
      }> = [];

      const unsubscribe = listenOnStepStart(event => {
        receivedEvents.push({
          stepNumber: event.stepNumber,
          provider: event.model.provider,
          modelId: event.model.modelId,
          messageCount: event.messages.length,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStepStart(
        createMockOnStepStartEvent({
          stepNumber: 2,
          model: { provider: 'openai', modelId: 'gpt-4o' },
          messages: [
            { role: 'user', content: 'message 1' },
            { role: 'assistant', content: 'message 2' },
          ],
        }),
      );

      expect(receivedEvents).toMatchInlineSnapshot(`
        [
          {
            "messageCount": 2,
            "modelId": "gpt-4o",
            "provider": "openai",
            "stepNumber": 2,
          },
        ]
      `);
    });

    it('should call the optional callback after listeners', async () => {
      const callOrder: string[] = [];

      const unsubscribe = listenOnStepStart(() => {
        callOrder.push('listener');
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStepStart(createMockOnStepStartEvent(), () => {
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

      await notifyOnStepStart(createMockOnStepStartEvent(), async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        callOrder.push('async callback completed');
      });

      callOrder.push('after notifyOnStepStart');

      expect(callOrder).toMatchInlineSnapshot(`
        [
          "async callback completed",
          "after notifyOnStepStart",
        ]
      `);
    });

    it('should catch errors in listeners without breaking', async () => {
      const calls: string[] = [];

      const unsubscribe1 = listenOnStepStart(() => {
        calls.push('listener 1 before throw');
        throw new Error('listener 1 error');
      });
      const unsubscribe2 = listenOnStepStart(() => {
        calls.push('listener 2');
      });
      unsubscribers.push(unsubscribe1, unsubscribe2);

      await notifyOnStepStart(createMockOnStepStartEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener 1 before throw",
          "listener 2",
        ]
      `);
    });

    it('should catch errors in callback without breaking', async () => {
      const calls: string[] = [];

      const unsubscribe = listenOnStepStart(() => {
        calls.push('listener');
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStepStart(createMockOnStepStartEvent(), () => {
        calls.push('callback before throw');
        throw new Error('callback error');
      });

      calls.push('after notifyOnStepStart');

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener",
          "callback before throw",
          "after notifyOnStepStart",
        ]
      `);
    });

    it('should work with no listeners registered', async () => {
      const calls: string[] = [];

      await notifyOnStepStart(createMockOnStepStartEvent(), () => {
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

      const unsubscribe = listenOnStepStart(() => {
        calls.push('listener');
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStepStart(createMockOnStepStartEvent());

      expect(calls).toMatchInlineSnapshot(`
        [
          "listener",
        ]
      `);
    });

    it('should work with neither listeners nor callback', async () => {
      await expect(
        notifyOnStepStart(createMockOnStepStartEvent()),
      ).resolves.toBeUndefined();
    });
  });

  describe('type safety', () => {
    it('should provide typed event properties to listeners', async () => {
      const unsubscribe = listenOnStepStart(event => {
        const _stepNumber: number = event.stepNumber;
        const _model: { provider: string; modelId: string } = event.model;
        const _messages: readonly { role: string; content: unknown }[] =
          event.messages;

        expect(typeof _stepNumber).toBe('number');
        expect(_model).toBeDefined();
        expect(Array.isArray(_messages)).toBe(true);
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStepStart(createMockOnStepStartEvent());
    });

    it('should preserve event data through callback', async () => {
      const mockEvent = createMockOnStepStartEvent({
        stepNumber: 5,
        model: { provider: 'anthropic', modelId: 'claude-3' },
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      });

      const receivedData: Array<{
        stepNumber: number;
        provider: string;
        modelId: string;
        messageCount: number;
      }> = [];

      await notifyOnStepStart(mockEvent, event => {
        receivedData.push({
          stepNumber: event.stepNumber,
          provider: event.model.provider,
          modelId: event.model.modelId,
          messageCount: event.messages.length,
        });
      });

      expect(receivedData).toMatchInlineSnapshot(`
        [
          {
            "messageCount": 2,
            "modelId": "claude-3",
            "provider": "anthropic",
            "stepNumber": 5,
          },
        ]
      `);
    });

    it('should preserve info across multiple steps in a multi-step process', async () => {
      const receivedSteps: Array<{
        stepNumber: number;
        messageCount: number;
        previousStepCount: number;
      }> = [];

      const unsubscribe = listenOnStepStart(event => {
        receivedSteps.push({
          stepNumber: event.stepNumber,
          messageCount: event.messages.length,
          previousStepCount: event.steps.length,
        });
      });
      unsubscribers.push(unsubscribe);

      await notifyOnStepStart(
        createMockOnStepStartEvent({
          stepNumber: 0,
          messages: [{ role: 'user', content: 'What is the weather?' }],
          steps: [],
        }),
      );

      await notifyOnStepStart(
        createMockOnStepStartEvent({
          stepNumber: 1,
          messages: [
            { role: 'user', content: 'What is the weather?' },
            { role: 'assistant', content: 'Let me check that for you.' },
          ],
          steps: [{ stepNumber: 0 }] as never,
        }),
      );

      await notifyOnStepStart(
        createMockOnStepStartEvent({
          stepNumber: 2,
          messages: [
            { role: 'user', content: 'What is the weather?' },
            { role: 'assistant', content: 'Let me check that for you.' },
            { role: 'user', content: 'Thanks!' },
            { role: 'assistant', content: 'The weather is 72 degrees.' },
          ],
          steps: [{ stepNumber: 0 }, { stepNumber: 1 }] as never,
        }),
      );

      expect(receivedSteps).toMatchInlineSnapshot(`
        [
          {
            "messageCount": 1,
            "previousStepCount": 0,
            "stepNumber": 0,
          },
          {
            "messageCount": 2,
            "previousStepCount": 1,
            "stepNumber": 1,
          },
          {
            "messageCount": 4,
            "previousStepCount": 2,
            "stepNumber": 2,
          },
        ]
      `);
    });
  });
});
