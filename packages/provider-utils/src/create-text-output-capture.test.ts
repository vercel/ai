import { execFileSync } from 'node:child_process';
import { InvalidArgumentError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { createTextOutputCapture } from './create-text-output-capture';

describe('createTextOutputCapture', () => {
  it('counts discarded output while retaining only the prefix across chunks', () => {
    const capture = createTextOutputCapture({ maxLength: 4 });
    capture.append('ab');
    capture.append('cdef');
    capture.append('gh');
    expect(capture.text).toBe('abcd');
    expect(capture.length).toBe(8);
  });

  it('preserves empty output and output exactly at the limit', () => {
    const capture = createTextOutputCapture({ maxLength: 4 });
    capture.append('');
    expect(capture.text).toBe('');
    expect(capture.length).toBe(0);
    capture.append('abcd');
    expect(capture.text).toBe('abcd');
    expect(capture.length).toBe(4);
  });

  it('uses String.length and preserves a surrogate cut at the limit', () => {
    const capture = createTextOutputCapture({ maxLength: 2 });
    capture.append('a😀b\ud800');
    expect(capture.text).toBe('a\ud83d');
    expect(capture.length).toBe(5);
  });

  it('does not keep a large source alive through a retained substring', () => {
    const source = new URL('./create-text-output-capture.ts', import.meta.url);
    const growth = execFileSync(
      process.execPath,
      ['--experimental-strip-types', '--expose-gc', '--input-type=module'],
      {
        encoding: 'utf8',
        input: `
          import { createTextOutputCapture } from ${JSON.stringify(source.href)};
          const capture = createTextOutputCapture({ maxLength: 30_000 });
          globalThis.gc();
          const baseline = process.memoryUsage().heapUsed;
          (() => {
            const source = 'x'.repeat(32 * 1024 * 1024);
            Buffer.byteLength(source);
            capture.append(source);
          })();
          await new Promise(resolve => setImmediate(resolve));
          globalThis.gc();
          console.log(process.memoryUsage().heapUsed - baseline);
          // Keep capture live across the collection.
          if (capture.text.length !== 30_000) process.exit(1);
        `,
      },
    );
    expect(Number(growth.trim())).toBeLessThan(4 * 1024 * 1024);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid limits: %s',
    maxLength => {
      expect(() => createTextOutputCapture({ maxLength })).toThrow(
        InvalidArgumentError,
      );
    },
  );
});
