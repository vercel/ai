import { describe, expect, it } from 'vitest';
import { convertArrayToReadableStream } from '../../test';
import { smoothStream } from './smooth-stream';

describe('smoothStream', () => {
  let events: any[] = [];

  beforeEach(() => {
    events = [];
  });

  async function consumeStream(stream: ReadableStream<any>) {
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      events.push(value);
    }
  }

  function delay(delayInMs: number | null) {
    events.push(`delay ${delayInMs}`);
    return Promise.resolve();
  }

  describe('word chunking', () => {
    it('should combine partial words', async () => {
      const stream = convertArrayToReadableStream([
        { textDelta: 'Hello', type: 'text-delta' },
        { textDelta: ', ', type: 'text-delta' },
        { textDelta: 'world!', type: 'text-delta' },
        { type: 'step-finish' },
        { type: 'finish' },
      ]).pipeThrough(
        smoothStream({
          delayInMs: 10,
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toEqual([
        'delay 10',
        {
          textDelta: 'Hello, ',
          type: 'text-delta',
        },
        {
          textDelta: 'world!',
          type: 'text-delta',
        },
        {
          type: 'step-finish',
        },
        {
          type: 'finish',
        },
      ]);
    });

    it('should split larger text chunks', async () => {
      const stream = convertArrayToReadableStream([
        {
          textDelta: 'Hello, World! This is an example text.',
          type: 'text-delta',
        },
        { type: 'step-finish' },
        { type: 'finish' },
      ]).pipeThrough(
        smoothStream({
          delayInMs: 10,
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toEqual([
        'delay 10',
        {
          textDelta: 'Hello, ',
          type: 'text-delta',
        },
        'delay 10',
        {
          textDelta: 'World! ',
          type: 'text-delta',
        },
        'delay 10',
        {
          textDelta: 'This ',
          type: 'text-delta',
        },
        'delay 10',
        {
          textDelta: 'is ',
          type: 'text-delta',
        },
        'delay 10',
        {
          textDelta: 'an ',
          type: 'text-delta',
        },
        'delay 10',
        {
          textDelta: 'example ',
          type: 'text-delta',
        },
        {
          textDelta: 'text.',
          type: 'text-delta',
        },
        {
          type: 'step-finish',
        },
        {
          type: 'finish',
        },
      ]);
    });

    it('should keep longer whitespace sequences together', async () => {
      const stream = convertArrayToReadableStream([
        { textDelta: 'First line', type: 'text-delta' },
        { textDelta: ' \n\n', type: 'text-delta' },
        { textDelta: '  ', type: 'text-delta' },
        { textDelta: '  Multiple spaces', type: 'text-delta' },
        { textDelta: '\n    Indented', type: 'text-delta' },
        { type: 'step-finish' },
        { type: 'finish' },
      ]).pipeThrough(
        smoothStream({
          delayInMs: 10,
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toEqual([
        'delay 10',
        {
          textDelta: 'First ',
          type: 'text-delta',
        },
        'delay 10',
        {
          textDelta: 'line \n\n',
          type: 'text-delta',
        },
        'delay 10',
        {
          // note: leading whitespace is included here
          // because it is part of the new chunk:
          textDelta: '    Multiple ',
          type: 'text-delta',
        },
        'delay 10',
        {
          textDelta: 'spaces\n    ',
          type: 'text-delta',
        },
        {
          textDelta: 'Indented',
          type: 'text-delta',
        },
        {
          type: 'step-finish',
        },
        {
          type: 'finish',
        },
      ]);
    });
  });

  describe('line chunking', () => {
    it('should split text by lines when using line chunking mode', async () => {
      const stream = convertArrayToReadableStream([
        {
          textDelta: 'First line\nSecond line\nThird line with more text\n',
          type: 'text-delta',
        },
        { textDelta: 'Partial line', type: 'text-delta' },
        { textDelta: ' continues\nFinal line\n', type: 'text-delta' },
        { type: 'step-finish' },
        { type: 'finish' },
      ]).pipeThrough(
        smoothStream({
          delayInMs: 10,
          chunking: 'line',
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toEqual([
        'delay 10',
        {
          textDelta: 'First line\n',
          type: 'text-delta',
        },
        'delay 10',
        {
          textDelta: 'Second line\n',
          type: 'text-delta',
        },
        'delay 10',
        {
          textDelta: 'Third line with more text\n',
          type: 'text-delta',
        },
        'delay 10',
        {
          textDelta: 'Partial line continues\n',
          type: 'text-delta',
        },
        'delay 10',
        {
          textDelta: 'Final line\n',
          type: 'text-delta',
        },
        {
          type: 'step-finish',
        },
        {
          type: 'finish',
        },
      ]);
    });

    it('should handle text without line endings in line chunking mode', async () => {
      const stream = convertArrayToReadableStream([
        { textDelta: 'Text without', type: 'text-delta' },
        { textDelta: ' any line', type: 'text-delta' },
        { textDelta: ' breaks', type: 'text-delta' },
        { type: 'step-finish' },
        { type: 'finish' },
      ]).pipeThrough(
        smoothStream({
          chunking: 'line',
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toEqual([
        {
          textDelta: 'Text without any line breaks',
          type: 'text-delta',
        },
        {
          type: 'step-finish',
        },
        {
          type: 'finish',
        },
      ]);
    });
  });

  describe('delay', () => {
    it('should default to 10ms', async () => {
      const stream = convertArrayToReadableStream([
        { textDelta: 'Hello, world!', type: 'text-delta' },
        { type: 'step-finish' },
        { type: 'finish' },
      ]).pipeThrough(
        smoothStream({
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toEqual([
        'delay 10',
        {
          textDelta: 'Hello, ',
          type: 'text-delta',
        },
        {
          textDelta: 'world!',
          type: 'text-delta',
        },
        {
          type: 'step-finish',
        },
        {
          type: 'finish',
        },
      ]);
    });

    it('should support different number of milliseconds delay', async () => {
      const stream = convertArrayToReadableStream([
        { textDelta: 'Hello, world!', type: 'text-delta' },
        { type: 'step-finish' },
        { type: 'finish' },
      ]).pipeThrough(
        smoothStream({
          delayInMs: 20,
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toEqual([
        'delay 20',
        {
          textDelta: 'Hello, ',
          type: 'text-delta',
        },
        {
          textDelta: 'world!',
          type: 'text-delta',
        },
        {
          type: 'step-finish',
        },
        {
          type: 'finish',
        },
      ]);
    });

    it('should support null delay', async () => {
      const stream = convertArrayToReadableStream([
        { textDelta: 'Hello, world!', type: 'text-delta' },
        { type: 'step-finish' },
        { type: 'finish' },
      ]).pipeThrough(
        smoothStream({
          delayInMs: null,
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toEqual([
        'delay null',
        {
          textDelta: 'Hello, ',
          type: 'text-delta',
        },
        {
          textDelta: 'world!',
          type: 'text-delta',
        },
        {
          type: 'step-finish',
        },
        {
          type: 'finish',
        },
      ]);
    });
  });
});
