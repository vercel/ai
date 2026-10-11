import assert from 'node:assert/strict';
import { readUIMessageStream, type UIMessageChunk } from 'ai';
import { toUIMessageStream } from '../../../../packages/llamaindex/dist/index.js';

async function* source(text: string) {
  yield { delta: text };
}

async function main() {
  const left = toUIMessageStream(source('left')).getReader();
  const right = toUIMessageStream(source('right')).getReader();
  const chunks: UIMessageChunk[] = [];

  // Each adapter emits text-start, text-delta, and text-end. Interleave the
  // complete lifecycles in the same order that a merged UI stream can.
  for (let index = 0; index < 3; index++) {
    const [leftResult, rightResult] = await Promise.all([
      left.read(),
      right.read(),
    ]);

    assert.equal(leftResult.done, false);
    assert.equal(rightResult.done, false);
    chunks.push(leftResult.value, rightResult.value);
  }

  assert.equal((await left.read()).done, true);
  assert.equal((await right.read()).done, true);
  left.releaseLock();
  right.releaseLock();

  let finalMessage;
  for await (const message of readUIMessageStream({
    stream: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    }),
  })) {
    finalMessage = message;
  }

  assert.ok(finalMessage);
  const textParts = finalMessage.parts.filter(part => part.type === 'text');
  console.log('Final text parts:', JSON.stringify(textParts));

  assert.deepEqual(
    textParts.map(part => part.text).sort(),
    ['left', 'right'],
    'Issue #22807: interleaved LlamaIndex streams must produce separate text parts',
  );
  assert.deepEqual(
    textParts.map(part => part.state),
    ['done', 'done'],
    'Issue #22807: both interleaved LlamaIndex text parts must finish streaming',
  );
}

main();
