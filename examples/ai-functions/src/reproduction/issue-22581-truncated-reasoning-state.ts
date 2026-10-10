import assert from 'node:assert/strict';
import type {
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import {
  extractReasoningMiddleware,
  readUIMessageStream,
  streamText,
  toUIMessageStream,
  wrapLanguageModel,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 2,
    text: 0,
    reasoning: 2,
  },
};

class ReproducedBugError extends Error {}

async function run(
  text: string,
  finishReason: LanguageModelV4FinishReason['unified'],
) {
  const parts: LanguageModelV4StreamPart[] = [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: text },
    { type: 'text-end', id: 't' },
    {
      type: 'finish',
      finishReason: { unified: finishReason, raw: finishReason },
      usage,
    },
  ];
  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          for (const part of parts) {
            controller.enqueue(part);
          }
          controller.close();
        },
      }),
    }),
  });
  const result = streamText({
    model: wrapLanguageModel({
      model,
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }),
    prompt: 'hello',
  });

  let lastMessage;
  for await (const message of readUIMessageStream({
    stream: toUIMessageStream({ stream: result.stream }),
  })) {
    lastMessage = message;
  }

  assert.ok(lastMessage, 'UI message stream did not emit a message');
  const reasoningPart = lastMessage.parts.find(
    part => part.type === 'reasoning',
  );
  assert.ok(reasoningPart, 'Final UI message did not contain reasoning');

  return {
    finishReason: await result.finishReason,
    reasoningPart,
  };
}

async function main() {
  const control = await run('<think>Done</think>Answer', 'stop');
  assert.equal(control.finishReason, 'stop');
  assert.equal(control.reasoningPart.text, 'Done');
  assert.equal(control.reasoningPart.state, 'done');

  const truncated = await run('<think>Still thinking', 'length');
  assert.equal(truncated.finishReason, 'length');
  assert.equal(truncated.reasoningPart.text, 'Still thinking');

  if (truncated.reasoningPart.state === 'streaming') {
    throw new ReproducedBugError(
      'ISSUE_22581: final reasoning part remains streaming after response completion',
    );
  }

  assert.equal(truncated.reasoningPart.state, 'done');
  console.log('Issue #22581 did not reproduce.');
}

main().catch(error => {
  if (error instanceof ReproducedBugError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
