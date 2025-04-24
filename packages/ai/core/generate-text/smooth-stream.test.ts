import { describe, expect, it } from 'vitest';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
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

  describe('throws error if chunking option is invalid', async () => {
    it('throws error if chunking strategy is invalid', async () => {
      expect(() => {
        smoothStream({
          chunking: 'foo' as any,
        });
      }).toThrowError();
    });

    it('throws error if chunking option is null', async () => {
      expect(() => {
        smoothStream({
          chunking: null as any,
        });
      }).toThrowError();
    });
  });

  describe('word chunking', () => {
    it('should combine partial words', async () => {
      const stream = convertArrayToReadableStream([
        { text: 'Hello', type: 'text' },
        { text: ', ', type: 'text' },
        { text: 'world!', type: 'text' },
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
          text: 'Hello, ',
          type: 'text',
        },
        {
          text: 'world!',
          type: 'text',
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
          text: 'Hello, World! This is an example text.',
          type: 'text',
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
          text: 'Hello, ',
          type: 'text',
        },
        'delay 10',
        {
          text: 'World! ',
          type: 'text',
        },
        'delay 10',
        {
          text: 'This ',
          type: 'text',
        },
        'delay 10',
        {
          text: 'is ',
          type: 'text',
        },
        'delay 10',
        {
          text: 'an ',
          type: 'text',
        },
        'delay 10',
        {
          text: 'example ',
          type: 'text',
        },
        {
          text: 'text.',
          type: 'text',
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
        { text: 'First line', type: 'text' },
        { text: ' \n\n', type: 'text' },
        { text: '  ', type: 'text' },
        { text: '  Multiple spaces', type: 'text' },
        { text: '\n    Indented', type: 'text' },
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
          text: 'First ',
          type: 'text',
        },
        'delay 10',
        {
          text: 'line \n\n',
          type: 'text',
        },
        'delay 10',
        {
          // note: leading whitespace is included here
          // because it is part of the new chunk:
          text: '    Multiple ',
          type: 'text',
        },
        'delay 10',
        {
          text: 'spaces\n    ',
          type: 'text',
        },
        {
          text: 'Indented',
          type: 'text',
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
        { type: 'text', text: 'I will check the' },
        { type: 'text', text: ' weather in Lon' },
        { type: 'text', text: 'don.' },
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
            "text": "I ",
            "type": "text",
          },
          "delay 10",
          {
            "text": "will ",
            "type": "text",
          },
          "delay 10",
          {
            "text": "check ",
            "type": "text",
          },
          "delay 10",
          {
            "text": "the ",
            "type": "text",
          },
          "delay 10",
          {
            "text": "weather ",
            "type": "text",
          },
          "delay 10",
          {
            "text": "in ",
            "type": "text",
          },
          {
            "text": "London.",
            "type": "text",
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
        { type: 'text', text: 'I will check the' },
        { type: 'text', text: ' weather in Lon' },
        { type: 'text', text: 'don.' },
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
            "text": "I ",
            "type": "text",
          },
          "delay 10",
          {
            "text": "will ",
            "type": "text",
          },
          "delay 10",
          {
            "text": "check ",
            "type": "text",
          },
          "delay 10",
          {
            "text": "the ",
            "type": "text",
          },
          "delay 10",
          {
            "text": "weather ",
            "type": "text",
          },
          "delay 10",
          {
            "text": "in ",
            "type": "text",
          },
          {
            "text": "London.",
            "type": "text",
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

    it(`doesn't return chunks with just spaces`, async () => {
      const stream = convertArrayToReadableStream([
        { type: 'text', text: ' ' },
        { type: 'text', text: ' ' },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'foo' },

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
          {
            "text": "   foo",
            "type": "text",
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
          text: 'First line\nSecond line\nThird line with more text\n',
          type: 'text',
        },
        { text: 'Partial line', type: 'text' },
        { text: ' continues\nFinal line\n', type: 'text' },
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
          text: 'First line\n',
          type: 'text',
        },
        'delay 10',
        {
          text: 'Second line\n',
          type: 'text',
        },
        'delay 10',
        {
          text: 'Third line with more text\n',
          type: 'text',
        },
        'delay 10',
        {
          text: 'Partial line continues\n',
          type: 'text',
        },
        'delay 10',
        {
          text: 'Final line\n',
          type: 'text',
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
        { text: 'Text without', type: 'text' },
        { text: ' any line', type: 'text' },
        { text: ' breaks', type: 'text' },
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
          text: 'Text without any line breaks',
          type: 'text',
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
    it(`should return correct result for regexes that don't match from the exact start onwards`, async () => {
      const stream = convertArrayToReadableStream([
        { text: 'Hello_, world!', type: 'text' },
        { type: 'step-finish' },
        { type: 'finish' },
      ]).pipeThrough(
        smoothStream({
          chunking: /_/,
          delayInMs: 10,
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toMatchInlineSnapshot(`
        [
          "delay 10",
          {
            "text": "Hello_",
            "type": "text",
          },
          {
            "text": ", world!",
            "type": "text",
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

    it('should support custom chunking regexps (character-level)', async () => {
      const stream = convertArrayToReadableStream([
        { text: 'Hello, world!', type: 'text' },
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
        { text: 'H', type: 'text' },
        'delay 10',
        { text: 'e', type: 'text' },
        'delay 10',
        { text: 'l', type: 'text' },
        'delay 10',
        { text: 'l', type: 'text' },
        'delay 10',
        { text: 'o', type: 'text' },
        'delay 10',
        { text: ',', type: 'text' },
        'delay 10',
        { text: ' ', type: 'text' },
        'delay 10',
        { text: 'w', type: 'text' },
        'delay 10',
        { text: 'o', type: 'text' },
        'delay 10',
        { text: 'r', type: 'text' },
        'delay 10',
        { text: 'l', type: 'text' },
        'delay 10',
        { text: 'd', type: 'text' },
        'delay 10',
        { text: '!', type: 'text' },
        { type: 'step-finish' },
        { type: 'finish' },
      ]);
    });
  });

  describe('custom callback chunking', () => {
    it('should support custom chunking callback', async () => {
      const stream = convertArrayToReadableStream([
        { text: 'He_llo, ', type: 'text' },
        { text: 'w_orld!', type: 'text' },
        { type: 'step-finish' },
        { type: 'finish' },
      ]).pipeThrough(
        smoothStream({
          chunking: buffer => /[^_]*_/.exec(buffer)?.[0],
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toMatchInlineSnapshot(`
        [
          "delay 10",
          {
            "text": "He_",
            "type": "text",
          },
          "delay 10",
          {
            "text": "llo, w_",
            "type": "text",
          },
          {
            "text": "orld!",
            "type": "text",
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

    describe('throws errors if the chunking function invalid matches', async () => {
      it('throws empty match error', async () => {
        const stream = convertArrayToReadableStream([
          { text: 'Hello, world!', type: 'text' },
          { type: 'step-finish' },
          { type: 'finish' },
        ]).pipeThrough(
          smoothStream({ chunking: () => '', _internal: { delay } })({
            tools: {},
          }),
        );

        await expect(
          consumeStream(stream),
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `[Error: Chunking function must return a non-empty string.]`,
        );
      });

      it('throws match prefix error', async () => {
        const stream = convertArrayToReadableStream([
          { text: 'Hello, world!', type: 'text' },
          { type: 'step-finish' },
          { type: 'finish' },
        ]).pipeThrough(
          smoothStream({ chunking: () => 'world', _internal: { delay } })({
            tools: {},
          }),
        );

        await expect(
          consumeStream(stream),
        ).rejects.toThrowErrorMatchingInlineSnapshot(
          `[Error: Chunking function must return a match that is a prefix of the buffer. Received: "world" expected to start with "Hello, world!"]`,
        );
      });
    });
  });

  describe('delay', () => {
    it('should default to 10ms', async () => {
      const stream = convertArrayToReadableStream([
        { text: 'Hello, world!', type: 'text' },
        { type: 'step-finish' },
        { type: 'finish' },
      ]).pipeThrough(
        smoothStream({
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toMatchInlineSnapshot(`
        [
          "delay 10",
          {
            "text": "Hello, ",
            "type": "text",
          },
          {
            "text": "world!",
            "type": "text",
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

    it('should support different number of milliseconds delay', async () => {
      const stream = convertArrayToReadableStream([
        { text: 'Hello, world!', type: 'text' },
        { type: 'step-finish' },
        { type: 'finish' },
      ]).pipeThrough(
        smoothStream({
          delayInMs: 20,
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toMatchInlineSnapshot(`
        [
          "delay 20",
          {
            "text": "Hello, ",
            "type": "text",
          },
          {
            "text": "world!",
            "type": "text",
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

    it('should support null delay', async () => {
      const stream = convertArrayToReadableStream([
        { text: 'Hello, world!', type: 'text' },
        { type: 'step-finish' },
        { type: 'finish' },
      ]).pipeThrough(
        smoothStream({
          delayInMs: null,
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toMatchInlineSnapshot(`
        [
          "delay null",
          {
            "text": "Hello, ",
            "type": "text",
          },
          {
            "text": "world!",
            "type": "text",
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
});
