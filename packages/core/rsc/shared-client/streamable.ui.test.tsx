import { createStreamableValue } from '../streamable';
import { readStreamableValue } from './streamable';

function nextTick() {
  return Promise.resolve();
}

async function getRawChunks(s: any) {
  const { next, ...otherFields } = s;
  const chunks = [otherFields];
  if (next) {
    chunks.push(...(await getRawChunks(await next)));
  }
  return chunks;
}

describe('rsc - readStreamableValue()', () => {
  it('should return an async iterable', () => {
    const streamable = createStreamableValue();
    const result = readStreamableValue(streamable.value);
    streamable.done();

    expect(result).toBeDefined();
    expect(result[Symbol.asyncIterator]).toBeDefined();
  });

  it('should directly emit the final value when reading .value', async () => {
    const streamable = createStreamableValue('1');
    streamable.update('2');
    streamable.update('3');

    expect(streamable.value).toMatchInlineSnapshot(`
      {
        "curr": "3",
        "next": Promise {},
        "type": Symbol(ui.streamable.value),
      }
    `);

    streamable.done('4');

    expect(streamable.value).toMatchInlineSnapshot(`
      {
        "curr": "4",
        "type": Symbol(ui.streamable.value),
      }
    `);
  });

  it('should be able to stream any JSON values', async () => {
    const streamable = createStreamableValue();
    streamable.update({ v: 123 });

    expect(streamable.value).toMatchInlineSnapshot(`
      {
        "curr": {
          "v": 123,
        },
        "next": Promise {},
        "type": Symbol(ui.streamable.value),
      }
    `);

    streamable.done();
  });

  it('should support .error()', async () => {
    const streamable = createStreamableValue();
    streamable.error('This is an error');

    expect(streamable.value).toMatchInlineSnapshot(`
      {
        "error": "This is an error",
        "type": Symbol(ui.streamable.value),
      }
    `);
  });

  it('should support reading streamed values and errors', async () => {
    const streamable = createStreamableValue(1);
    (async () => {
      await nextTick();
      streamable.update(2);
      await nextTick();
      streamable.update(3);
      await nextTick();
      streamable.error('This is an error');
    })();

    const values = [];

    try {
      for await (const v of readStreamableValue(streamable.value)) {
        values.push(v);
      }
    } catch (e) {
      expect(e).toMatchInlineSnapshot(`"This is an error"`);
    }

    expect(values).toMatchInlineSnapshot(`
      [
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

  describe('patch', () => {
    it('should be able to append strings as patch', async () => {
      const streamable = createStreamableValue();
      const value = streamable.value;

      streamable.update('hello');
      streamable.update('hello world');
      streamable.update('hello world!');
      streamable.update('new string');
      streamable.done('new string with patch!');

      expect(await getRawChunks(value)).toMatchInlineSnapshot(`
        [
          {
            "curr": undefined,
            "type": Symbol(ui.streamable.value),
          },
          {
            "curr": "hello",
          },
          {
            "diff": [
              0,
              " world",
            ],
          },
          {
            "diff": [
              0,
              "!",
            ],
          },
          {
            "curr": "new string",
          },
          {
            "diff": [
              0,
              " with patch!",
            ],
          },
        ]
      `);

      const values = [];
      for await (const v of readStreamableValue(value)) {
        values.push(v);
      }
      expect(values).toMatchInlineSnapshot(`
        [
          "hello",
          "hello world",
          "hello world!",
          "new string",
          "new string with patch!",
        ]
      `);
    });
  });
});
