import assert from 'node:assert/strict';
import { smoothStream, type TextStreamPart, type ToolSet } from 'ai';

async function collectSegments({
  chunks,
  granularity,
}: {
  chunks: string[];
  granularity: 'word' | 'grapheme';
}) {
  const stream = new ReadableStream<TextStreamPart<ToolSet>>({
    start(controller) {
      controller.enqueue({ type: 'text-start', id: 'text' });

      for (const text of chunks) {
        controller.enqueue({ type: 'text-delta', id: 'text', text });
      }

      controller.enqueue({ type: 'text-end', id: 'text' });
      controller.close();
    },
  }).pipeThrough(
    smoothStream({
      chunking: new Intl.Segmenter('en', { granularity }),
      bufferUnfinishedSegments: true,
      delayInMs: null,
    })({ tools: {} }),
  );

  const segments: string[] = [];

  for await (const part of stream) {
    if (part.type === 'text-delta') {
      segments.push(part.text);
    }
  }

  return segments;
}

const words = await collectSegments({
  chunks: ['hel', 'lo world'],
  granularity: 'word',
});
const graphemes = await collectSegments({
  chunks: ['e', '\u0301'],
  granularity: 'grapheme',
});

assert.deepEqual(words, ['hello', ' ', 'world']);
assert.deepEqual(graphemes, ['e\u0301']);

console.log({ words, graphemes });
