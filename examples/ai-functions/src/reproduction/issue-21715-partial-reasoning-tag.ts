import type {
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { extractReasoningMiddleware, streamText, wrapLanguageModel } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

const usage: LanguageModelV3Usage = {
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

async function runStream(delta: string) {
  const stream: LanguageModelV3StreamPart[] = [
    { type: 'text-start', id: '1' },
    { type: 'text-delta', id: '1', delta },
    { type: 'text-end', id: '1' },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
    },
  ];

  const result = streamText({
    model: wrapLanguageModel({
      model: new MockLanguageModelV3({
        doStream: {
          stream: convertArrayToReadableStream(stream),
        },
      }),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }),
    prompt: 'test',
  });

  const [text, reasoningText] = await Promise.all([
    result.text,
    result.reasoningText,
  ]);

  return { text, reasoningText };
}

async function main() {
  const partialOpeningTag = await runStream('Use the <th');
  const partialClosingTag = await runStream('<think>a </th');

  const actual = {
    text: partialOpeningTag.text,
    reasoning: partialClosingTag.reasoningText,
  };
  const expected = {
    text: 'Use the <th',
    reasoning: 'a </th',
  };

  if (
    actual.text === expected.text &&
    actual.reasoning === expected.reasoning
  ) {
    return;
  }

  if (actual.text === 'Use the ' && actual.reasoning === 'a ') {
    throw new Error(
      'ISSUE 21715 REPRODUCED: extractReasoningMiddleware dropped buffered partial tags',
    );
  }

  throw new Error(`Unexpected output: ${JSON.stringify({ actual, expected })}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
