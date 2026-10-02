import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { SteeringClosedError } from '../error';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { generateText } from './generate-text';
import { SteeringController } from './steering-controller';

const testUsage: LanguageModelV4Usage = {
  inputTokens: {
    total: 5,
    noCache: 5,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 10,
    text: 10,
    reasoning: undefined,
  },
};

const dummyResponseValues = {
  finishReason: { unified: 'stop', raw: 'stop' } as const,
  usage: testUsage,
  warnings: [],
};

describe('generateText with SteeringController', () => {
  it('should support steering during tool execution', async () => {
    const controller = new SteeringController();
    let stepCount = 0;
    let receivedStep1Messages: unknown = undefined;
    let steerPromise: Promise<unknown> | undefined;

    const generatePromise = generateText({
      model: new MockLanguageModelV4({
        doGenerate: async ({ prompt }) => {
          stepCount++;
          if (stepCount === 1) {
            return {
              ...dummyResponseValues,
              finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
              content: [
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'search',
                  input: JSON.stringify({ query: 'initial query' }),
                },
              ],
            };
          }

          receivedStep1Messages = prompt;
          return {
            ...dummyResponseValues,
            finishReason: { unified: 'stop', raw: 'stop' },
            content: [{ type: 'text', text: 'final answer after steering' }],
          };
        },
      }),
      tools: {
        search: {
          inputSchema: z.object({ query: z.string() }),
          execute: async () => {
            // Trigger steering during tool execution
            steerPromise = controller.steer('Focus on TypeScript');
            return 'search results for initial query';
          },
        },
      },
      prompt: 'start prompt',
      experimental_steeringSignal: controller.signal,
    });

    const result = await generatePromise;
    const receipt = await steerPromise;

    expect(receipt).toEqual({ stepNumber: 1 });
    expect(stepCount).toBe(2);
    expect(result.steps).toHaveLength(2);
    expect(result.text).toBe('final answer after steering');

    const promptStr = JSON.stringify(receivedStep1Messages);
    expect(promptStr).toContain('Focus on TypeScript');
  });

  it('should support steering during a text-only turn', async () => {
    const controller = new SteeringController();
    let stepCount = 0;
    let steerPromise: Promise<unknown> | undefined;

    const generatePromise = generateText({
      model: new MockLanguageModelV4({
        doGenerate: async () => {
          stepCount++;
          if (stepCount === 1) {
            steerPromise = controller.steer('Steered text message');
            return {
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'initial text' }],
            };
          }

          return {
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'second step text' }],
          };
        },
      }),
      prompt: 'hello',
      experimental_steeringSignal: controller.signal,
    });

    const result = await generatePromise;
    const receipt = await steerPromise;

    expect(receipt).toEqual({ stepNumber: 1 });
    expect(stepCount).toBe(2);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[1].text).toBe('second step text');
  });

  it('should override default isStepCount(1) for exactly one step and stop after', async () => {
    const controller = new SteeringController();
    let stepCount = 0;
    let steerPromise: Promise<unknown> | undefined;

    const generatePromise = generateText({
      model: new MockLanguageModelV4({
        doGenerate: async () => {
          stepCount++;
          if (stepCount === 1) {
            steerPromise = controller.steer('Single steer');
            return {
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'step 0' }],
            };
          }

          // Step 1: no new steering
          return {
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'step 1' }],
          };
        },
      }),
      prompt: 'test',
      experimental_steeringSignal: controller.signal,
    });

    const result = await generatePromise;
    const receipt = await steerPromise;

    expect(receipt).toEqual({ stepNumber: 1 });
    expect(stepCount).toBe(2);
    expect(result.steps).toHaveLength(2);
  });

  it('should preserve existing stopWhen behavior when no steering occurs', async () => {
    const controller = new SteeringController();
    let stepCount = 0;

    const result = await generateText({
      model: new MockLanguageModelV4({
        doGenerate: async () => {
          stepCount++;
          return {
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'only step' }],
          };
        },
      }),
      prompt: 'test',
      experimental_steeringSignal: controller.signal,
    });

    expect(stepCount).toBe(1);
    expect(result.steps).toHaveLength(1);
  });

  it('should reject steering after execution has completed', async () => {
    const controller = new SteeringController();

    await generateText({
      model: new MockLanguageModelV4({
        doGenerate: async () => ({
          ...dummyResponseValues,
          content: [{ type: 'text', text: 'done' }],
        }),
      }),
      prompt: 'test',
      experimental_steeringSignal: controller.signal,
    });

    await expect(controller.steer('too late')).rejects.toThrow(
      SteeringClosedError,
    );
  });

  it('should preserve FIFO order with multiple steered messages', async () => {
    const controller = new SteeringController();
    let stepCount = 0;
    let step1Messages: unknown = undefined;
    let p1: Promise<unknown> | undefined;
    let p2: Promise<unknown> | undefined;

    const generatePromise = generateText({
      model: new MockLanguageModelV4({
        doGenerate: async ({ prompt }) => {
          stepCount++;
          if (stepCount === 1) {
            p1 = controller.steer('First steer');
            p2 = controller.steer('Second steer');
            return {
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'first response' }],
            };
          }

          step1Messages = prompt;
          return {
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'second response' }],
          };
        },
      }),
      prompt: 'initial',
      experimental_steeringSignal: controller.signal,
    });

    await generatePromise;
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ stepNumber: 1 });
    expect(r2).toEqual({ stepNumber: 1 });

    const serialized = JSON.stringify(step1Messages);
    const idxFirst = serialized.indexOf('First steer');
    const idxSecond = serialized.indexOf('Second steer');
    expect(idxFirst).toBeGreaterThan(-1);
    expect(idxSecond).toBeGreaterThan(idxFirst);
  });

  it('should pass steered messages into prepareStep naturally', async () => {
    const controller = new SteeringController();
    let stepCount = 0;
    let prepareStepObservedMessages: unknown = undefined;
    let steerPromise: Promise<unknown> | undefined;

    const generatePromise = generateText({
      model: new MockLanguageModelV4({
        doGenerate: async () => {
          stepCount++;
          if (stepCount === 1) {
            steerPromise = controller.steer('PrepareStep check');
            return {
              ...dummyResponseValues,
              content: [{ type: 'text', text: 'step 0' }],
            };
          }
          return {
            ...dummyResponseValues,
            content: [{ type: 'text', text: 'step 1' }],
          };
        },
      }),
      prepareStep: ({ messages, stepNumber }) => {
        if (stepNumber === 1) {
          prepareStepObservedMessages = messages;
        }
        return undefined;
      },
      prompt: 'hello',
      experimental_steeringSignal: controller.signal,
    });

    await generatePromise;
    await steerPromise;

    const serialized = JSON.stringify(prepareStepObservedMessages);
    expect(serialized).toContain('PrepareStep check');
  });
});
