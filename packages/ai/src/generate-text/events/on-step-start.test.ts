import { describe, it, expect } from 'vitest';
import { notifyOnStepStart } from './on-step-start';
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
  describe('notifyOnStepStart', () => {
    it('should call a single callback with the event', async () => {
      const calls: string[] = [];
      const event = createMockOnStepStartEvent();

      await notifyOnStepStart({
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
      const event = createMockOnStepStartEvent();

      await notifyOnStepStart({
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
        notifyOnStepStart({
          event: createMockOnStepStartEvent(),
          callbacks: undefined,
        }),
      ).resolves.toBeUndefined();
    });

    it('should work with omitted callbacks', async () => {
      await expect(
        notifyOnStepStart({
          event: createMockOnStepStartEvent(),
        }),
      ).resolves.toBeUndefined();
    });

    it('should await async callbacks', async () => {
      const callOrder: string[] = [];
      const event = createMockOnStepStartEvent();

      await notifyOnStepStart({
        event,
        callbacks: async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          callOrder.push('async callback completed');
        },
      });

      callOrder.push('after notifyOnStepStart');

      expect(callOrder).toMatchInlineSnapshot(`
        [
          "async callback completed",
          "after notifyOnStepStart",
        ]
      `);
    });

    it('should swallow errors in array and continue with subsequent callbacks', async () => {
      const calls: string[] = [];
      const event = createMockOnStepStartEvent();

      await notifyOnStepStart({
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

    it('should pass event data to callbacks (stepNumber, model, messages, steps)', async () => {
      const receivedEvents: Array<{
        stepNumber: number;
        provider: string;
        modelId: string;
        messageCount: number;
        stepsLength: number;
      }> = [];
      const event = createMockOnStepStartEvent({
        stepNumber: 2,
        model: { provider: 'openai', modelId: 'gpt-4o' },
        messages: [
          { role: 'user', content: 'message 1' },
          { role: 'assistant', content: 'message 2' },
        ],
        steps: [{ stepNumber: 0 }, { stepNumber: 1 }] as never,
      });

      await notifyOnStepStart({
        event,
        callbacks: ev => {
          receivedEvents.push({
            stepNumber: ev.stepNumber,
            provider: ev.model.provider,
            modelId: ev.model.modelId,
            messageCount: ev.messages.length,
            stepsLength: ev.steps.length,
          });
        },
      });

      expect(receivedEvents).toMatchInlineSnapshot(`
        [
          {
            "messageCount": 2,
            "modelId": "gpt-4o",
            "provider": "openai",
            "stepNumber": 2,
            "stepsLength": 2,
          },
        ]
      `);
    });

    it('should preserve event data through callback', async () => {
      const receivedData: Array<{
        stepNumber: number;
        provider: string;
        modelId: string;
        messageCount: number;
      }> = [];
      const mockEvent = createMockOnStepStartEvent({
        stepNumber: 5,
        model: { provider: 'anthropic', modelId: 'claude-3' },
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      });

      await notifyOnStepStart({
        event: mockEvent,
        callbacks: ev => {
          receivedData.push({
            stepNumber: ev.stepNumber,
            provider: ev.model.provider,
            modelId: ev.model.modelId,
            messageCount: ev.messages.length,
          });
        },
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

    it('should preserve info across multiple steps in a multi-step sequence', async () => {
      const receivedSteps: Array<{
        stepNumber: number;
        messageCount: number;
        previousStepCount: number;
      }> = [];

      await notifyOnStepStart({
        event: createMockOnStepStartEvent({
          stepNumber: 0,
          messages: [{ role: 'user', content: 'What is the weather?' }],
          steps: [],
        }),
        callbacks: ev => {
          receivedSteps.push({
            stepNumber: ev.stepNumber,
            messageCount: ev.messages.length,
            previousStepCount: ev.steps.length,
          });
        },
      });

      await notifyOnStepStart({
        event: createMockOnStepStartEvent({
          stepNumber: 1,
          messages: [
            { role: 'user', content: 'What is the weather?' },
            { role: 'assistant', content: 'Let me check that for you.' },
          ],
          steps: [{ stepNumber: 0 }] as never,
        }),
        callbacks: ev => {
          receivedSteps.push({
            stepNumber: ev.stepNumber,
            messageCount: ev.messages.length,
            previousStepCount: ev.steps.length,
          });
        },
      });

      await notifyOnStepStart({
        event: createMockOnStepStartEvent({
          stepNumber: 2,
          messages: [
            { role: 'user', content: 'What is the weather?' },
            { role: 'assistant', content: 'Let me check that for you.' },
            { role: 'user', content: 'Thanks!' },
            { role: 'assistant', content: 'The weather is 72 degrees.' },
          ],
          steps: [{ stepNumber: 0 }, { stepNumber: 1 }] as never,
        }),
        callbacks: ev => {
          receivedSteps.push({
            stepNumber: ev.stepNumber,
            messageCount: ev.messages.length,
            previousStepCount: ev.steps.length,
          });
        },
      });

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

    it('should provide typed event properties to callbacks', async () => {
      const event = createMockOnStepStartEvent();

      await notifyOnStepStart({
        event,
        callbacks: ev => {
          const _stepNumber: number = ev.stepNumber;
          const _model: { provider: string; modelId: string } = ev.model;
          const _messages: readonly { role: string; content: unknown }[] =
            ev.messages;

          expect(typeof _stepNumber).toBe('number');
          expect(_model).toBeDefined();
          expect(Array.isArray(_messages)).toBe(true);
        },
      });
    });
  });
});
