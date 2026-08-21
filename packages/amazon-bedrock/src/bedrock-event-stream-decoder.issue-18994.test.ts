import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createBedrockEventStreamDecoder } from './bedrock-event-stream-decoder';

interface LiveFixture {
  response: {
    bodyBase64: string;
  };
}

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        './__fixtures__/issue-18994-live-converse-stream.json',
        import.meta.url,
      ),
    ),
    'utf8',
  ),
) as LiveFixture;

const liveResponseBytes = Uint8Array.from(
  Buffer.from(fixture.response.bodyBase64, 'base64'),
);

function splitFrames(bytes: Uint8Array): Uint8Array[] {
  const frames: Uint8Array[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const totalLength = new DataView(
      bytes.buffer,
      bytes.byteOffset + offset,
      4,
    ).getUint32(0, false);
    frames.push(bytes.slice(offset, offset + totalLength));
    offset += totalLength;
  }

  return frames;
}

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function readAll<T>(stream: ReadableStream<T>): Promise<T[]> {
  const values: T[] = [];
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return values;
    }
    values.push(value);
  }
}

describe('issue #18994', () => {
  it('errors the stream when a frame has an invalid message CRC', async () => {
    const frames = splitFrames(liveResponseBytes);
    frames[0][frames[0].length - 1] ^= 0xff;

    const stream = createBedrockEventStreamDecoder(
      streamFromChunks(frames),
      () => {},
    );

    await expect(readAll(stream)).rejects.toBeDefined();
  });

  it('propagates a processEvent rejection', async () => {
    const expectedError = new Error('processEvent failed');
    const [firstFrame] = splitFrames(liveResponseBytes);

    const stream = createBedrockEventStreamDecoder(
      streamFromChunks([firstFrame]),
      async () => {
        throw expectedError;
      },
    );

    await expect(readAll(stream)).rejects.toBe(expectedError);
  });
});
