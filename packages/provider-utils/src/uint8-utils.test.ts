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
});

describe('toArrayBufferBackedUint8Array', () => {
  it('creates a view over an existing ArrayBuffer without copying', () => {
    const buffer = new ArrayBuffer(4);
    const input = new Uint8Array(buffer, 1, 2);
    input.set([1, 2]);

    const result = toArrayBufferBackedUint8Array(input);

    expect(result.buffer).toBe(buffer);
    expect(result.byteOffset).toBe(1);
    expect(result).toEqual(new Uint8Array([1, 2]));

    input[0] = 3;
    expect(result[0]).toBe(3);
  });

  it('copies a SharedArrayBuffer-backed view into an ArrayBuffer', () => {
    const buffer = new SharedArrayBuffer(4);
    const input = new Uint8Array(buffer, 1, 2);
    input.set([1, 2]);

    const result = toArrayBufferBackedUint8Array(input);

    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    expect(result).toEqual(new Uint8Array([1, 2]));

    input[0] = 3;
    expect(result[0]).toBe(1);
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
