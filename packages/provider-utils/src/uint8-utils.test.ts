import { describe, expect, it } from 'vitest';

import {
  createTextDecoderStream,
  toArrayBufferBackedUint8Array,
} from './uint8-utils';

describe('createTextDecoderStream', () => {
  it('decodes multi-byte characters split across chunks', async () => {
    const bytes = new TextEncoder().encode('A🙂B');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 3));
        controller.enqueue(bytes.subarray(3));
        controller.close();
      },
    });

    expect(await readText(stream.pipeThrough(createTextDecoderStream()))).toBe(
      'A🙂B',
    );
  });

  it('decodes SharedArrayBuffer-backed chunks', async () => {
    const bytes = new TextEncoder().encode('shared');
    const buffer = new SharedArrayBuffer(bytes.byteLength);
    const chunk = new Uint8Array(buffer);
    chunk.set(bytes);
    const stream = new ReadableStream<Uint8Array<SharedArrayBuffer>>({
      start(controller) {
        controller.enqueue(chunk);
        controller.close();
      },
    });

    expect(await readText(stream.pipeThrough(createTextDecoderStream()))).toBe(
      'shared',
    );
  });

  it('handles empty stream via flush', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    expect(await readText(stream.pipeThrough(createTextDecoderStream()))).toBe(
      '',
    );
  });
});

describe('toArrayBufferBackedUint8Array', () => {
  it('converts ArrayBuffer view to backed array', () => {
    const arr = new Uint8Array([1, 2, 3]);
    const result = toArrayBufferBackedUint8Array(arr);
    expect(result).toEqual(new Uint8Array([1, 2, 3]));
  });
});

async function readText(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader();
  let result = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return result;
    }
    result += value;
  }
}
