import { delay } from '../../util/delay';
import { createStreamableValue } from './create-streamable-value';
import { readStreamableValue } from './read-streamable-value';

it('should return an async iterable', () => {
  const streamable = createStreamableValue();
  const result = readStreamableValue(streamable.value);
  streamable.done();

  expect(result).toBeDefined();
  expect(result[Symbol.asyncIterator]).toBeDefined();
});

it('should support reading streamed values and errors', async () => {
  const streamable = createStreamableValue(1);

  (async () => {
    await delay();
    streamable.update(2);
    await delay();
    streamable.update(3);
    await delay();
    streamable.error('This is an error');
  })();

  const values = [];

  try {
    for await (const v of readStreamableValue(streamable.value)) {
      values.push(v);
    }
    expect.fail('should not be reached');
  } catch (e) {
    expect(e).toStrictEqual('This is an error');
  }

  expect(values).toStrictEqual([1, 2, 3]);
});

it('should be able to read values asynchronously with different value types', async () => {
  const streamable = createStreamableValue({});

  (async () => {
    await delay();
    streamable.update([1]);
    streamable.update(['2']);
    streamable.done({ 3: 3 });
  })();

  const values = [];
  for await (const v of readStreamableValue(streamable.value)) {
    values.push(v);
  }

  expect(values).toStrictEqual([{}, [1], ['2'], { '3': 3 }]);
});

it('should be able to replay errors', async () => {
  const streamable = createStreamableValue(0);

  (async () => {
    await delay();
    streamable.update(1);
    streamable.update(2);
    streamable.error({ customErrorMessage: 'this is an error' });
  })();

  const values = [];

  try {
    for await (const v of readStreamableValue(streamable.value)) {
      values.push(v);
    }

    expect.fail('should not be reached');
  } catch (e) {
    expect(e).toStrictEqual({
      customErrorMessage: 'this is an error',
    });
  }
  expect(values).toStrictEqual([0, 1, 2]);
});

it('should be able to append strings as patch', async () => {
  const streamable = createStreamableValue();
  const value = streamable.value;

  streamable.update('hello');
  streamable.update('hello world');
  streamable.update('hello world!');
  streamable.update('new string');
  streamable.done('new string with patch!');

  const values = [];
  for await (const v of readStreamableValue(value)) {
    values.push(v);
  }

  expect(values).toStrictEqual([
    'hello',
    'hello world',
    'hello world!',
    'new string',
    'new string with patch!',
  ]);
});

it('should be able to call .append() to send patches', async () => {
  const streamable = createStreamableValue();
  const value = streamable.value;

  streamable.append('hello');
  streamable.append(' world');
  streamable.append('!');
  streamable.done();

  const values = [];
  for await (const v of readStreamableValue(value)) {
    values.push(v);
  }

  expect(values).toStrictEqual(['hello', 'hello world', 'hello world!']);
});

it('should be able to mix .update() and .append() with optimized payloads', async () => {
  const streamable = createStreamableValue('hello');
  const value = streamable.value;

  streamable.append(' world');
  streamable.update('hello world!!');
  streamable.update('some new');
  streamable.update('some new string');
  streamable.append(' with patch!');
  streamable.done();

  const values = [];
  for await (const v of readStreamableValue(value)) {
    values.push(v);
  }

  expect(values).toStrictEqual([
    'hello',
    'hello world',
    'hello world!!',
    'some new',
    'some new string',
    'some new string with patch!',
  ]);
});

it('should behave like .update() with .append() and .done()', async () => {
  const streamable = createStreamableValue('hello');
  const value = streamable.value;

  streamable.append(' world');
  streamable.done('fin');

  const values = [];
  for await (const v of readStreamableValue(value)) {
    values.push(v);
  }

  expect(values).toStrictEqual(['hello', 'hello world', 'fin']);
});
