import type {
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import {
  extractReasoningMiddleware,
  simulateReadableStream,
  streamText,
  wrapLanguageModel,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import assert from 'node:assert/strict';

const usage: LanguageModelV4Usage = {
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

async function run(delta: string) {
  const chunks: LanguageModelV4StreamPart[] = [
    { type: 'text-start', id: '1' },
    { type: 'text-delta', id: '1', delta },
    { type: 'text-end', id: '1' },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
    },
  ];

  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({ chunks }),
    }),
  });
  const result = streamText({
    model: wrapLanguageModel({
      model,
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }),
    prompt: 'Test',
  });

  const [text, reasoningText] = await Promise.all([
    result.text,
    result.reasoningText,
  ]);
  return { text, reasoningText };
}

async function main() {
  const textCase = await run('Use the <th');
  const reasoningCase = await run('<think>a </th');

  const hasReportedTextLoss = textCase.text === 'Use the ';
  const hasReportedReasoningLoss = reasoningCase.reasoningText === 'a ';

  if (hasReportedTextLoss && hasReportedReasoningLoss) {
    console.error(
      'ISSUE_21715: extractReasoningMiddleware dropped buffered partial-tag text',
    );
    console.error({
      textCase,
      expectedText: 'Use the <th',
      reasoningCase,
      expectedReasoningText: 'a </th',
    });
    process.exitCode = 1;
    return;
  }

  assert.equal(textCase.text, 'Use the <th');
  assert.equal(reasoningCase.reasoningText, 'a </th');
  console.log('Issue #21715 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
