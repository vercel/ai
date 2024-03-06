import { createStreamableValue } from '../streamable';
import { readStreamableValue } from './streamable';

describe('rsc - readStreamableValue()', () => {
  it('should return an async iterable', () => {
    const streamable = createStreamableValue();
    const result = readStreamableValue(streamable.value);
    streamable.done();

    expect(result).toBeDefined();
    expect(result[Symbol.asyncIterator]).toBeDefined();
  });

  it('should be able to read all values', async () => {
    const streamable = createStreamableValue(0);

    streamable.update(1);
    streamable.update(2);
    streamable.done(3);

    const values = [];
    for await (const v of readStreamableValue(streamable.value)) {
      values.push(v);
    }
    expect(values).toMatchInlineSnapshot(`
      [
        0,
        1,
        2,
        3,
      ]
    `);
  });

  it('should be able to read values asynchronously with different value types', async () => {
    const streamable = createStreamableValue({});

    (async () => {
      // Defer this a bit.
      await Promise.resolve();
      streamable.update([1]);
      streamable.update(['2']);
      streamable.done({ 3: 3 });
    })();

    const values = [];
    for await (const v of readStreamableValue(streamable.value)) {
      values.push(v);
    }
    expect(values).toMatchInlineSnapshot(`
      [
        {},
        [
          1,
        ],
        [
          "2",
        ],
        {
          "3": 3,
        },
      ]
    `);
  });

  it('should be able to replay errors', async () => {
    const streamable = createStreamableValue(0);

    (async () => {
      // Defer this a bit.
      await Promise.resolve();
      streamable.update(1);
      streamable.update(2);
      streamable.error({ customErrorMessage: 'this is an error' });
    })();

    const values = [];

    try {
      for await (const v of readStreamableValue(streamable.value)) {
        values.push(v);
      }
    } catch (e) {
      expect(e).toMatchInlineSnapshot(`
        {
          "customErrorMessage": "this is an error",
        }
      `);
    }
    expect(values).toMatchInlineSnapshot(`
      [
        0,
        1,
        2,
      ]
    `);
  });
});
