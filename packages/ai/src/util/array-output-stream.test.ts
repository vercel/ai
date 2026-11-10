import { asSchema } from '@ai-sdk/provider-utils';
import { describe, expect, it, vi } from 'vitest';
import * as z from 'zod/v4';
import { createArrayOutputStreamParser } from './array-output-stream';

describe('createArrayOutputStreamParser', () => {
  it.each([1, 2, 7, 10000])(
    'parses nested values and escaped strings in chunks of %i characters',
    async chunkSize => {
      const values = [
        { nested: ['a,]}\\"', { number: -1.25e30 }], unicode: '中文🌍' },
        [false, null, [1, 2]],
        -12.5e-3,
        'escaped \\ and " quotes',
        true,
        null,
      ];
      const validate = vi.fn();
      const parser = createArrayOutputStreamParser({
        schema: asSchema(z.unknown().superRefine(validate)),
        skipInvalidElements: true,
      });
      const text = JSON.stringify({ elements: values });
      const snapshots: unknown[][] = [];
      let json = '';
      for (let i = 0; i < text.length; i += chunkSize) {
        const result = await parser(text.slice(i, i + chunkSize));
        expect(result).not.toBe('fallback');
        if (result != null && result !== 'fallback') {
          snapshots.push(result.partial);
          json += result.textDelta;
        }
      }
      expect(snapshots.at(-1)).toEqual(values);
      expect(JSON.parse(json)).toEqual(values);
      expect(validate).toHaveBeenCalledTimes(values.length);
      // Earlier snapshots are immutable as the stream grows.
      expect(snapshots.map(value => value.length)).toEqual(
        [...new Set(snapshots.map(value => value.length))].sort(
          (a, b) => a - b,
        ),
      );
    },
  );

  it('withholds the last element until a new element starts or the object closes', async () => {
    const parser = createArrayOutputStreamParser({
      schema: asSchema(z.number()),
      skipInvalidElements: true,
    });
    expect(await parser('{"elements":[1,')).toEqual({
      partial: [],
      textDelta: '[',
    });
    expect(await parser('2')).toEqual({ partial: [1], textDelta: '1' });
    expect(await parser(']')).toBeUndefined();
    expect(await parser('}')).toEqual({ partial: [1, 2], textDelta: ',2]' });
  });

  it.each([
    '{"other":[],"elements":[1]}',
    '{"elem\\u0065nts":[1]}',
    '{"elements":[1,]}',
    '{"elements":[1e,2]}',
    '{"elements":[1],"elements":[2]}',
    '{"elements":[1]} trailing',
  ])('falls back for unsupported or malformed JSON: %s', async text => {
    const parser = createArrayOutputStreamParser({
      schema: asSchema(z.number()),
      skipInvalidElements: true,
    });
    expect(await parser(text)).toBe('fallback');
  });

  it('preserves transformed elements and skips invalid elements when requested', async () => {
    const parser = createArrayOutputStreamParser({
      schema: asSchema(z.number().transform(value => String(value))),
      skipInvalidElements: true,
    });
    expect(await parser('{"elements":[1,"invalid",2]}')).toEqual({
      partial: ['1', '2'],
      textDelta: '["1","2"]',
    });
  });

  it('falls back on schema errors for legacy array output', async () => {
    const parser = createArrayOutputStreamParser({
      schema: asSchema(z.number()),
      skipInvalidElements: false,
    });
    expect(await parser('{"elements":[1,"invalid",2]}')).toBe('fallback');
  });
});
