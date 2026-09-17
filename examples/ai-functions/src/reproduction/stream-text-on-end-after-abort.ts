import assert from 'node:assert/strict';
import { streamText, stepCountIs, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';

type CallbackRecord =
  | { type: 'abort'; steps: number }
  | {
      type: 'end';
      text: string;
      finishReason: string;
      steps: number;
    };

async function main() {
  const controller = new AbortController();
  const callbacks: CallbackRecord[] = [];
  let calls = 0;

  const usage = {
    inputTokens: {
      total: 1,
      noCache: 1,
      cacheRead: 0,
      cacheWrite: 0,
    },
    outputTokens: {
      total: 1,
      text: 1,
      reasoning: 0,
    },
  };

  const model = new MockLanguageModelV4({
    doStream: async ({ abortSignal }) => {
      const step = ++calls;

      return {
        stream: new ReadableStream({
          start(streamController) {
            streamController.enqueue({
              type: 'stream-start',
              warnings: [],
            });

            if (step === 1) {
              streamController.enqueue({
                type: 'tool-call',
                toolCallId: 'tool-1',
                toolName: 'echo',
                input: '{}',
              });
              streamController.enqueue({
                type: 'finish',
                finishReason: {
                  unified: 'tool-calls',
                  raw: 'tool-calls',
                },
                usage,
              });
              streamController.close();
              return;
            }

            streamController.enqueue({
              type: 'text-start',
              id: 'text-2',
            });
            streamController.enqueue({
              type: 'text-delta',
              id: 'text-2',
              delta: 'Partial reply.',
            });
            abortSignal?.addEventListener(
              'abort',
              () => streamController.error(abortSignal.reason),
              { once: true },
            );
          },
        }),
      };
    },
  });

  const result = streamText({
    model,
    prompt: 'Fixture.',
    abortSignal: controller.signal,
    tools: {
      echo: tool({
        inputSchema: z.object({}),
        execute: async () => 'ok',
      }),
    },
    stopWhen: stepCountIs(3),
    onAbort: ({ steps }) => {
      callbacks.push({ type: 'abort', steps: steps.length });
    },
    onEnd: ({ text, finishReason, steps }) => {
      callbacks.push({
        type: 'end',
        text,
        finishReason,
        steps: steps.length,
      });
    },
  });

  const parts: string[] = [];

  for await (const part of result.stream) {
    parts.push(part.type);

    if (part.type === 'text-delta') {
      controller.abort(new DOMException('User stopped', 'AbortError'));
    }
  }

  assert.equal(calls, 2);
  assert.equal(parts.at(-1), 'abort');
  assert.ok(!parts.includes('finish'));
  assert.deepEqual(
    callbacks.filter(callback => callback.type === 'abort'),
    [{ type: 'abort', steps: 1 }],
  );

  console.log(JSON.stringify({ callbacks, parts }));

  assert.equal(
    callbacks.filter(callback => callback.type === 'end').length,
    0,
    'ISSUE_20908_UNEXPECTED_ON_END_AFTER_ABORT',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
