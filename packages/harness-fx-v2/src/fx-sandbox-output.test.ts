import { describe, expect, test } from 'vitest';
import { createFxOutputCapture } from './fx-sandbox-output';

const MIB = 1024 * 1024;

describe('createFxOutputCapture', () => {
  test('keeps output that fits the kept head and tail', () => {
    const capture = createFxOutputCapture({ headBytes: 4, tailBytes: 4 });
    capture.add(Uint8Array.from([1, 2, 3]));

    expect(capture.complete).toBe(true);
    expect(capture.totalBytes).toBe(3);
    expect([...capture.toBytes()]).toEqual([1, 2, 3]);
  });

  test('keeps only the head and the tail of a large output', () => {
    const capture = createFxOutputCapture({ headBytes: 4, tailBytes: 4 });
    capture.add(Uint8Array.from([1, 2, 3]));
    capture.add(Uint8Array.from([4, 5, 6, 7, 8, 9, 10]));

    expect(capture.complete).toBe(false);
    expect(capture.totalBytes).toBe(10);
    expect([...capture.toBytes()]).toEqual([1, 2, 3, 4, 7, 8, 9, 10]);
  });

  test('keeps one large chunk bounded too', () => {
    const capture = createFxOutputCapture({
      headBytes: 64 * 1024,
      tailBytes: 64 * 1024,
    });
    for (let index = 0; index < 16; index++) {
      capture.add(new Uint8Array(MIB).fill(index));
    }

    expect(capture.complete).toBe(false);
    expect(capture.totalBytes).toBe(16 * MIB);
    expect(capture.toBytes().length).toBe(128 * 1024);
    expect(capture.toBytes()[0]).toBe(0);
    expect(capture.toBytes().at(-1)).toBe(15);
  });

  test('cuts the kept bytes at UTF-8 character boundaries', () => {
    // 'a€bc€d', so that both cut ends fall inside a character.
    const output = new TextEncoder().encode('a\u20acbc\u20acd');
    const capture = createFxOutputCapture({ headBytes: 2, tailBytes: 2 });
    capture.add(output);

    expect(
      new TextDecoder('utf-8', { fatal: true }).decode(capture.toBytes()),
    ).toBe('ad');
  });
});
