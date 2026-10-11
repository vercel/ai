import {
  convertArrayToAsyncIterable,
  convertReadableStreamToArray,
} from 'ai/test';
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';
import { toUIMessageStream } from './llamaindex-adapter';
import { describe, it, expect } from 'vitest';

describe('toUIMessageStream', () => {
  it('should convert AsyncIterable<EngineResponse>', async () => {
    const inputStream = convertArrayToAsyncIterable([
      { delta: 'Hello' },
      { delta: 'World' },
    ]);

    const chunks = await convertReadableStreamToArray(
      toUIMessageStream(inputStream),
    );

    expect(chunks).toEqual([
      {
        id: expect.any(String),
        type: 'text-start',
      },
      {
        delta: 'Hello',
        id: expect.any(String),
        type: 'text-delta',
      },
      {
        delta: 'World',
        id: expect.any(String),
        type: 'text-delta',
      },
      {
        id: expect.any(String),
        type: 'text-end',
      },
    ]);
    expect(
      new Set(chunks.map(chunk => ('id' in chunk ? chunk.id : undefined))).size,
    ).toBe(1);
  });

  it('should keep interleaved adapter streams in separate text parts', async () => {
    const [leftChunks, rightChunks] = await Promise.all([
      convertReadableStreamToArray(
        toUIMessageStream(convertArrayToAsyncIterable([{ delta: 'left' }])),
      ),
      convertReadableStreamToArray(
        toUIMessageStream(convertArrayToAsyncIterable([{ delta: 'right' }])),
      ),
    ]);

    const chunks: UIMessageChunk[] = leftChunks.flatMap((chunk, index) => [
      chunk,
      rightChunks[index],
    ]);

    let finalMessage: UIMessage | undefined;
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

    expect(
      finalMessage?.parts
        .filter(part => part.type === 'text')
        .map(part => ({ text: part.text, state: part.state }))
        .sort((left, right) => left.text.localeCompare(right.text)),
    ).toEqual([
      { text: 'left', state: 'done' },
      { text: 'right', state: 'done' },
    ]);
  });
});
