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

  it('should not allow steering to bypass pending tool approval and should allow steering after approval is supplied', async () => {
    // 1. Turn 1: Assistant produces a tool call requiring user approval. Steering is submitted during turn 1.
    const controllerTurn1 = new SteeringController();
    let stepCountTurn1 = 0;
    let steerPromiseTurn1: Promise<unknown> | undefined;

    const resultTurn1 = await generateText({
      model: new MockLanguageModelV4({
        doGenerate: async () => {
          stepCountTurn1++;
          return {
            ...dummyResponseValues,
            finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'sensitiveAction',
                input: JSON.stringify({ action: 'delete' }),
              },
            ],
          };
        },
      }),
      tools: {
        sensitiveAction: {
          inputSchema: z.object({ action: z.string() }),
          needsApproval: () => true,
          execute: async () => 'action executed',
        },
      },
      prompt: 'do action',
      experimental_steeringSignal: controllerTurn1.signal,
      onStepEnd: () => {
        steerPromiseTurn1 = controllerTurn1.steer(
          'Steer during pending approval',
        );
      },
    });

    // Verify steering did NOT cause another LLM step with the incomplete conversation:
    expect(stepCountTurn1).toBe(1);
    expect(resultTurn1.steps).toHaveLength(1);
    expect(resultTurn1.finishReason).toBe('tool-calls');
    await expect(steerPromiseTurn1).rejects.toThrow(SteeringClosedError);

    // 2. Turn 2: Supply the required tool approval response, and verify steering proceeds normally:
    const controllerTurn2 = new SteeringController();
    let stepCountTurn2 = 0;
    let steerPromiseTurn2: Promise<unknown> | undefined;
    let receivedTurn2Step1Prompt: unknown = undefined;

    const approvalRequest = resultTurn1.steps[0].content.find(
      c => c.type === 'tool-approval-request',
    ) as { approvalId: string };

    const resultTurn2 = await generateText({
      model: new MockLanguageModelV4({
        doGenerate: async ({ prompt }) => {
          stepCountTurn2++;
          if (stepCountTurn2 === 1) {
            steerPromiseTurn2 = controllerTurn2.steer(
              'Steer after tool resolved',
            );
            return {
              ...dummyResponseValues,
              finishReason: { unified: 'stop', raw: 'stop' },
              content: [
                { type: 'text', text: 'Step 0 text after tool result' },
              ],
            };
          }

          receivedTurn2Step1Prompt = prompt;
          return {
            ...dummyResponseValues,
            finishReason: { unified: 'stop', raw: 'stop' },
            content: [{ type: 'text', text: 'Step 1 text after steering' }],
          };
        },
      }),
      tools: {
        sensitiveAction: {
          inputSchema: z.object({ action: z.string() }),
          needsApproval: () => true,
          execute: async () => 'action executed',
        },
      },
      messages: [
        ...resultTurn1.response.messages,
        {
          role: 'tool',
          content: [
            {
              type: 'tool-approval-response',
              approvalId: approvalRequest.approvalId,
              toolCall: resultTurn1.toolCalls[0],
              approved: true,
            },
          ],
        },
      ],
      experimental_steeringSignal: controllerTurn2.signal,
    });

    const receiptTurn2 = await steerPromiseTurn2;
    expect(receiptTurn2).toEqual({ stepNumber: 1 });
    expect(stepCountTurn2).toBe(2);
    expect(resultTurn2.steps).toHaveLength(2);
    expect(resultTurn2.text).toBe('Step 1 text after steering');

    const promptStr = JSON.stringify(receivedTurn2Step1Prompt);
    expect(promptStr).toContain('Steer after tool resolved');
    expect(promptStr).toContain('action executed');
  });
});
