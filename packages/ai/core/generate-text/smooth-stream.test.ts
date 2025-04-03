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
        'delay 10',
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
        'delay 10',
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
          textDelta: 'line \n\n    ',
          type: 'text-delta',
        },
        'delay 10',
        {
          // note: leading whitespace not included here
          // because it is part of the last chunk:
          textDelta: 'Multiple ',
          type: 'text-delta',
        },
        'delay 10',
        {
          textDelta: 'spaces\n    ',
          type: 'text-delta',
        },
        'delay 10',
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

    it('should send remaining text buffer before tool call starts', async () => {
      const stream = convertArrayToReadableStream([
        { type: 'text-delta', textDelta: 'I will check the' },
        { type: 'text-delta', textDelta: ' weather in Lon' },
        { type: 'text-delta', textDelta: 'don.' },
        { type: 'tool-call', name: 'weather', args: { city: 'London' } },
        { type: 'step-finish' },
        { type: 'finish' },
      ]).pipeThrough(
        smoothStream({
          delayInMs: 10,
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toMatchInlineSnapshot(`
        [
          "delay 10",
          {
            "textDelta": "I ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "will ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "check ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "the ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "weather ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "in ",
            "type": "text-delta",
          },
          {
            "textDelta": "London.",
            "type": "text-delta",
          },
          {
            "args": {
              "city": "London",
            },
            "name": "weather",
            "type": "tool-call",
          },
          {
            "type": "step-finish",
          },
          {
            "type": "finish",
          },
        ]
      `);
    });

    it('should send remaining text buffer before tool call starts and tool call streaming is enabled', async () => {
      const stream = convertArrayToReadableStream([
        { type: 'text-delta', textDelta: 'I will check the' },
        { type: 'text-delta', textDelta: ' weather in Lon' },
        { type: 'text-delta', textDelta: 'don.' },
        {
          type: 'tool-call-streaming-start',
          name: 'weather',
          args: { city: 'London' },
        },
        { type: 'tool-call-delta', name: 'weather', args: { city: 'London' } },
        { type: 'tool-call', name: 'weather', args: { city: 'London' } },
        { type: 'step-finish' },
        { type: 'finish' },
      ]).pipeThrough(
        smoothStream({
          delayInMs: 10,
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toMatchInlineSnapshot(`
        [
          "delay 10",
          {
            "textDelta": "I ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "will ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "check ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "the ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "weather ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "in ",
            "type": "text-delta",
          },
          {
            "textDelta": "London.",
            "type": "text-delta",
          },
          {
            "args": {
              "city": "London",
            },
            "name": "weather",
            "type": "tool-call-streaming-start",
          },
          {
            "args": {
              "city": "London",
            },
            "name": "weather",
            "type": "tool-call-delta",
          },
          {
            "args": {
              "city": "London",
            },
            "name": "weather",
            "type": "tool-call",
          },
          {
            "type": "step-finish",
          },
          {
            "type": "finish",
          },
        ]
      `);
    });

    it('should support kanji', async () => {
      const stream = convertArrayToReadableStream([
        { textDelta: 'Vercel', type: 'text-delta' },
        { textDelta: 'はサ', type: 'text-delta' },
        { textDelta: 'サーバーレス', type: 'text-delta' },
        { textDelta: 'の', type: 'text-delta' },
        { textDelta: 'フロントエンド', type: 'text-delta' },
        { textDelta: 'Hello, world!', type: 'text-delta' },
        { type: 'step-finish' },
        { type: 'finish' },
      ]).pipeThrough(
        smoothStream({
          delayInMs: 10,
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toMatchInlineSnapshot(`
        [
          "delay 10",
          {
            "textDelta": "Vercelは",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "サ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "サ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "ー",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "バ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "ー",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "レ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "ス",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "の",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "フ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "ロ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "ン",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "ト",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "エ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "ン",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "ド",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "Hello, ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "textDelta": "world!",
            "type": "text-delta",
          },
          {
            "type": "step-finish",
          },
          {
            "type": "finish",
          },
        ]
      `);
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

  describe('custom chunking', () => {
    it('should support custom chunking regexps (character-level)', async () => {
      const stream = convertArrayToReadableStream([
        { textDelta: 'Hello, world!', type: 'text-delta' },
        { type: 'step-finish' },
        { type: 'finish' },
      ]).pipeThrough(
        smoothStream({
          chunking: /./,
          delayInMs: 10,
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toEqual([
        'delay 10',
        { textDelta: 'H', type: 'text-delta' },
        'delay 10',
        { textDelta: 'e', type: 'text-delta' },
        'delay 10',
        { textDelta: 'l', type: 'text-delta' },
        'delay 10',
        { textDelta: 'l', type: 'text-delta' },
        'delay 10',
        { textDelta: 'o', type: 'text-delta' },
        'delay 10',
        { textDelta: ', ', type: 'text-delta' },
        'delay 10',
        { textDelta: 'w', type: 'text-delta' },
        'delay 10',
        { textDelta: 'o', type: 'text-delta' },
        'delay 10',
        { textDelta: 'r', type: 'text-delta' },
        'delay 10',
        { textDelta: 'l', type: 'text-delta' },
        'delay 10',
        { textDelta: 'd', type: 'text-delta' },
        'delay 10',
        { textDelta: '!', type: 'text-delta' },
        { type: 'step-finish' },
        { type: 'finish' },
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
        'delay 10',
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
        'delay 20',
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
