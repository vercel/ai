import assert from 'node:assert/strict';
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';

async function main() {
  const initial: UIMessage = {
    id: 'assistant',
    role: 'assistant',
    parts: [{ type: 'text', text: 'Prefix', state: 'done' }],
  };
  const before = structuredClone(initial);

  async function continueWith(text: string) {
    let last: UIMessage | undefined;
    const chunks: UIMessageChunk[] = [
      { type: 'start', messageId: 'assistant' },
      { type: 'text-start', id: text },
      { type: 'text-delta', id: text, delta: text },
      { type: 'text-end', id: text },
      { type: 'finish' },
    ];
    const stream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });

    for await (const message of readUIMessageStream({
      message: initial,
      stream,
    })) {
      last = message;
    }

    assert.ok(last, 'The continuation stream should emit a UI message');
    return last.parts
      .filter(part => part.type === 'text')
      .map(part => part.text);
  }

  const first = await continueWith('A');
  const afterFirst = structuredClone(initial);
  assert.deepEqual(
    first,
    ['Prefix', 'A'],
    'The first continuation must append to the seed',
  );

  const second = await continueWith('B');
  const afterSecond = structuredClone(initial);

  console.log(
    JSON.stringify({
      first,
      second,
      originalParts: initial.parts
        .filter(part => part.type === 'text')
        .map(part => part.text),
    }),
  );

  assert.deepEqual(
    { afterFirst, afterSecond, second },
    {
      afterFirst: before,
      afterSecond: before,
      second: ['Prefix', 'B'],
    },
    'readUIMessageStream mutated its caller-owned seed and contaminated an independent continuation',
  );
}

await main();
