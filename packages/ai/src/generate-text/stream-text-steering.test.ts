import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { SteeringClosedError } from '../error';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { SteeringController } from './steering-controller';
import { streamText } from './stream-text';

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

describe('streamText with SteeringController', () => {
  it('should support steering during tool execution in streamText', async () => {
    const controller = new SteeringController();
    let stepCount = 0;
    let steerPromise: Promise<unknown> | undefined;

    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async () => {
          stepCount++;
          if (stepCount === 1) {
            return {
              stream: convertArrayToReadableStream([
                {
                  type: 'tool-call',
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'search',
                  input: JSON.stringify({ query: 'initial' }),
                },
                {
                  type: 'finish',
                  finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
                  usage: testUsage,
                },
              ]),
            };
          }

          return {
            stream: convertArrayToReadableStream([
              { type: 'text-start', id: '2' },
              { type: 'text-delta', id: '2', delta: 'steered response' },
              { type: 'text-end', id: '2' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: testUsage,
              },
            ]),
          };
        },
      }),
      tools: {
        search: {
          inputSchema: z.object({ query: z.string() }),
          execute: async () => {
            steerPromise = controller.steer('Steered topic');
            return 'search results';
          },
        },
      },
      prompt: 'hello',
      experimental_steeringSignal: controller.signal,
    });

    const chunks: string[] = [];
    for await (const chunk of result.textStream) {
      chunks.push(chunk);
    }

    const receipt = await steerPromise;
    expect(receipt).toEqual({ stepNumber: 1 });
    expect(chunks.join('')).toBe('steered response');
    expect(stepCount).toBe(2);

    const steps = await result.steps;
    expect(steps).toHaveLength(2);
  });

  it('should support steering during a text-only stream', async () => {
    const controller = new SteeringController();
    let stepCount = 0;
    let steerPromise: Promise<unknown> | undefined;

    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async () => {
          stepCount++;
          if (stepCount === 1) {
            steerPromise = controller.steer('Steer text turn');
            return {
              stream: convertArrayToReadableStream([
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'step 0 delta ' },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage: testUsage,
                },
              ]),
            };
          }

          return {
            stream: convertArrayToReadableStream([
              { type: 'text-start', id: '2' },
              { type: 'text-delta', id: '2', delta: 'step 1 delta' },
              { type: 'text-end', id: '2' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: testUsage,
              },
            ]),
          };
        },
      }),
      prompt: 'hello',
      experimental_steeringSignal: controller.signal,
    });

    const chunks: string[] = [];
    for await (const chunk of result.textStream) {
      chunks.push(chunk);
    }

    const receipt = await steerPromise;
    expect(receipt).toEqual({ stepNumber: 1 });
    expect(chunks.join('')).toBe('step 0 delta step 1 delta');
    expect(stepCount).toBe(2);
  });

  it('should support consecutive steering across multiple steps and resume stopWhen', async () => {
    const controller = new SteeringController();
    let stepCount = 0;
    const promptsReceived: unknown[] = [];
    let steerPromise1: Promise<unknown> | undefined;
    let steerPromise2: Promise<unknown> | undefined;

    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async ({ prompt }) => {
          stepCount++;
          promptsReceived.push(prompt);

          if (stepCount === 1) {
            steerPromise1 = controller.steer('First steering message');
            return {
              stream: convertArrayToReadableStream([
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'step 0 response ' },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage: testUsage,
                },
              ]),
            };
          }

          if (stepCount === 2) {
            steerPromise2 = controller.steer('Second steering message');
            return {
              stream: convertArrayToReadableStream([
                { type: 'text-start', id: '2' },
                { type: 'text-delta', id: '2', delta: 'step 1 response ' },
                { type: 'text-end', id: '2' },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage: testUsage,
                },
              ]),
            };
          }

          return {
            stream: convertArrayToReadableStream([
              { type: 'text-start', id: '3' },
              { type: 'text-delta', id: '3', delta: 'step 2 final response' },
              { type: 'text-end', id: '3' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: testUsage,
              },
            ]),
          };
        },
      }),
      prompt: 'initial prompt',
      experimental_steeringSignal: controller.signal,
    });

    const chunks: string[] = [];
    for await (const chunk of result.textStream) {
      chunks.push(chunk);
    }

    const [receipt1, receipt2] = await Promise.all([
      steerPromise1,
      steerPromise2,
    ]);

    expect(receipt1).toEqual({ stepNumber: 1 });
    expect(receipt2).toEqual({ stepNumber: 2 });
    expect(stepCount).toBe(3);

    const fullText = chunks.join('');
    expect(fullText).toBe(
      'step 0 response step 1 response step 2 final response',
    );

    const step1Prompt = JSON.stringify(promptsReceived[1]);
    expect(step1Prompt).toContain('First steering message');

    const step2Prompt = JSON.stringify(promptsReceived[2]);
    expect(step2Prompt).toContain('First steering message');
    expect(step2Prompt).toContain('Second steering message');
    const idxFirst = step2Prompt.indexOf('First steering message');
    const idxSecond = step2Prompt.indexOf('Second steering message');
    expect(idxFirst).toBeGreaterThan(-1);
    expect(idxSecond).toBeGreaterThan(idxFirst);

    const steps = await result.steps;
    expect(steps).toHaveLength(3);
  });

  it('should preserve natural termination when no steering is provided', async () => {
    const controller = new SteeringController();
    let stepCount = 0;

    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async () => {
          stepCount++;
          return {
            stream: convertArrayToReadableStream([
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'only step' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: testUsage,
              },
            ]),
          };
        },
      }),
      prompt: 'hello',
      experimental_steeringSignal: controller.signal,
    });

    const chunks: string[] = [];
    for await (const chunk of result.textStream) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('only step');
    expect(stepCount).toBe(1);
  });

  it('should reject pending steering promises when aborted', async () => {
    const abortController = new AbortController();
    const controller = new SteeringController();

    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async () => {
          return {
            stream: convertArrayToReadableStream([
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'chunk' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: testUsage,
              },
            ]),
          };
        },
      }),
      prompt: 'hello',
      abortSignal: abortController.signal,
      experimental_steeringSignal: controller.signal,
    });

    const steerPromise = controller.steer('will abort');
    abortController.abort(new DOMException('Stream aborted', 'AbortError'));

    await expect(steerPromise).rejects.toThrow('Stream aborted');
  });

  it('should reject steer() with SteeringClosedError after streamText finishes', async () => {
    const controller = new SteeringController();

    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'done' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: testUsage,
            },
          ]),
        }),
      }),
      prompt: 'hello',
      experimental_steeringSignal: controller.signal,
    });

    for await (const _ of result.textStream) {
      // consume stream to completion
    }

    await expect(controller.steer('post-completion steer')).rejects.toThrow(
      SteeringClosedError,
    );
  });

  it('should not allow steering to bypass pending tool approval in streamText and should allow steering after approval is supplied', async () => {
    // 1. Turn 1: Model outputs a tool call that needs approval. Steering is submitted during turn 1.
    const controllerTurn1 = new SteeringController();
    let stepCountTurn1 = 0;
    let steerPromiseTurn1: Promise<unknown> | undefined;

    const resultTurn1 = streamText({
      model: new MockLanguageModelV4({
        doStream: async () => {
          stepCountTurn1++;
          return {
            stream: convertArrayToReadableStream([
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'sensitiveAction',
                input: JSON.stringify({ action: 'delete' }),
              },
              {
                type: 'finish',
                finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
                usage: testUsage,
              },
            ]),
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
    });

    steerPromiseTurn1 = controllerTurn1.steer('Steer during pending approval');

    for await (const _ of resultTurn1.textStream) {
      // consume stream
    }

    const stepsTurn1 = await resultTurn1.steps;
    expect(stepCountTurn1).toBe(1);
    expect(stepsTurn1).toHaveLength(1);
    expect(await resultTurn1.finishReason).toBe('tool-calls');
    await expect(steerPromiseTurn1).rejects.toThrow(SteeringClosedError);

    // 2. Turn 2: Supply the tool approval response and verify steering proceeds normally:
    const controllerTurn2 = new SteeringController();
    let stepCountTurn2 = 0;
    let steerPromiseTurn2: Promise<unknown> | undefined;
    let receivedTurn2Step1Prompt: unknown = undefined;

    const approvalRequest = stepsTurn1[0].content.find(
      c => c.type === 'tool-approval-request',
    ) as { approvalId: string };

    const resultTurn2 = streamText({
      model: new MockLanguageModelV4({
        doStream: async ({ prompt }) => {
          stepCountTurn2++;
          if (stepCountTurn2 === 1) {
            steerPromiseTurn2 = controllerTurn2.steer(
              'Steer after tool resolved',
            );
            return {
              stream: convertArrayToReadableStream([
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: 'Step 0 text' },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage: testUsage,
                },
              ]),
            };
          }

          receivedTurn2Step1Prompt = prompt;
          return {
            stream: convertArrayToReadableStream([
              { type: 'text-start', id: '2' },
              {
                type: 'text-delta',
                id: '2',
                delta: 'Step 1 text after steering',
              },
              { type: 'text-end', id: '2' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
                usage: testUsage,
              },
            ]),
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
        ...(await resultTurn1.response).messages,
        {
          role: 'tool',
          content: [
            {
              type: 'tool-approval-response',
              approvalId: approvalRequest.approvalId,
              toolCall: (await resultTurn1.toolCalls)[0],
              approved: true,
            },
          ],
        },
      ],
      experimental_steeringSignal: controllerTurn2.signal,
    });

    const chunksTurn2: string[] = [];
    for await (const chunk of resultTurn2.textStream) {
      chunksTurn2.push(chunk);
    }

    const receiptTurn2 = await steerPromiseTurn2;
    expect(receiptTurn2).toEqual({ stepNumber: 1 });
    expect(stepCountTurn2).toBe(2);
    expect(await resultTurn2.steps).toHaveLength(2);
    expect(chunksTurn2.join('')).toBe('Step 0 textStep 1 text after steering');

    const promptStr = JSON.stringify(receivedTurn2Step1Prompt);
    expect(promptStr).toContain('Steer after tool resolved');
    expect(promptStr).toContain('action executed');
  });

  it('should abort steering and reject pending and future steer() calls on stream cancellation', async () => {
    const controller = new SteeringController();
    let stopStreamFn: (() => void) | undefined;

    let resolveSecondChunk: (() => void) | undefined;
    const secondChunkPromise = new Promise<void>(resolve => {
      resolveSecondChunk = resolve;
    });

    try {
      const result = streamText({
        model: new MockLanguageModelV4({
          doStream: async () => ({
            stream: new ReadableStream({
              async start(c) {
                c.enqueue({ type: 'text-start', id: '1' });
                c.enqueue({
                  type: 'text-delta',
                  id: '1',
                  delta: 'first chunk',
                });
                await secondChunkPromise;
                c.enqueue({
                  type: 'text-delta',
                  id: '1',
                  delta: 'second chunk',
                });
                c.enqueue({ type: 'text-end', id: '1' });
                c.enqueue({
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage: testUsage,
                });
                c.close();
              },
            }),
          }),
        }),
        prompt: 'hello',
        experimental_transform: [
          ({ stopStream }) => {
            stopStreamFn = stopStream;
            return new TransformStream();
          },
        ],
        experimental_steeringSignal: controller.signal,
      });

      const reader = result.textStream.getReader();
      const firstChunk = await reader.read();
      expect(firstChunk.value).toBe('first chunk');

      expect(controller.signal.isSteerable).toBe(true);

      const pendingSteerPromise = controller.steer('mid-stream message');

      // Terminate the active stream execution via the public transform control:
      stopStreamFn?.();

      await expect(pendingSteerPromise).rejects.toThrow('Execution aborted');
      expect(controller.signal.isSteerable).toBe(false);

      await expect(controller.steer('future message')).rejects.toThrow(
        'Execution aborted',
      );

      reader.releaseLock();
    } finally {
      resolveSecondChunk?.();
    }
  });
});
