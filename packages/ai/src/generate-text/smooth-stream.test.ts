import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { smoothStream } from './smooth-stream';
import { TextStreamPart } from './stream-text-result';
import { ToolSet } from './tool-set';

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
      const stream = convertArrayToReadableStream<TextStreamPart<ToolSet>>([
        { type: 'text-start', id: '1' },
        { text: 'Hello', type: 'text-delta', id: '1' },
        { text: ', ', type: 'text-delta', id: '1' },
        { text: 'world!', type: 'text-delta', id: '1' },
        { type: 'text-end', id: '1' },
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
            "id": "1",
            "type": "text-start",
          },
          "delay 10",
          {
            "id": "1",
            "text": "Hello, ",
            "type": "text-delta",
          },
          {
            "id": "1",
            "text": "world!",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
        ]
      `);
    });

    it('should split larger text chunks', async () => {
      const stream = convertArrayToReadableStream<TextStreamPart<ToolSet>>([
        { type: 'text-start', id: '1' },
        {
          text: 'Hello, World! This is an example text.',
          type: 'text-delta',
          id: '1',
        },
        { type: 'text-end', id: '1' },
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
            "id": "1",
            "type": "text-start",
          },
          "delay 10",
          {
            "id": "1",
            "text": "Hello, ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "World! ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "This ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "is ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "an ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "example ",
            "type": "text-delta",
          },
          {
            "id": "1",
            "text": "text.",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
        ]
      `);
    });

    it('should keep longer whitespace sequences together', async () => {
      const stream = convertArrayToReadableStream<TextStreamPart<ToolSet>>([
        { type: 'text-start', id: '1' },
        { text: 'First line', type: 'text-delta', id: '1' },
        { text: ' \n\n', type: 'text-delta', id: '1' },
        { text: '  ', type: 'text-delta', id: '1' },
        { text: '  Multiple spaces', type: 'text-delta', id: '1' },
        { text: '\n    Indented', type: 'text-delta', id: '1' },
        { type: 'text-end', id: '1' },
      ]).pipeThrough(
        smoothStream({
          delayInMs: 10,
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toEqual([
        { id: '1', type: 'text-start' },
        'delay 10',
        {
          id: '1',
          text: 'First ',
          type: 'text-delta',
        },
        'delay 10',
        {
          id: '1',
          text: 'line \n\n',
          type: 'text-delta',
        },
        'delay 10',
        {
          // note: leading whitespace is included here
          // because it is part of the new chunk:
          id: '1',
          text: '    Multiple ',
          type: 'text-delta',
        },
        'delay 10',
        {
          id: '1',
          text: 'spaces\n    ',
          type: 'text-delta',
        },
        {
          id: '1',
          text: 'Indented',
          type: 'text-delta',
        },
        { id: '1', type: 'text-end' },
      ]);
    });

    it('should send remaining text buffer before tool call starts', async () => {
      const stream = convertArrayToReadableStream<TextStreamPart<ToolSet>>([
        { type: 'text-start', id: '1' },
        { text: 'I will check the', type: 'text-delta', id: '1' },
        { text: ' weather in Lon', type: 'text-delta', id: '1' },
        { text: 'don.', type: 'text-delta', id: '1' },
        {
          type: 'tool-call',
          toolCallId: '1',
          toolName: 'weather',
          input: { city: 'London' },
        },
        { type: 'text-end', id: '1' },
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
            "id": "1",
            "type": "text-start",
          },
          "delay 10",
          {
            "id": "1",
            "text": "I ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "will ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "check ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "the ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "weather ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "in ",
            "type": "text-delta",
          },
          {
            "id": "1",
            "text": "London.",
            "type": "text-delta",
          },
          {
            "input": {
              "city": "London",
            },
            "toolCallId": "1",
            "toolName": "weather",
            "type": "tool-call",
          },
          {
            "id": "1",
            "type": "text-end",
          },
        ]
      `);
    });

    it('should send remaining text buffer before tool call starts and tool call streaming is enabled', async () => {
      const stream = convertArrayToReadableStream<TextStreamPart<ToolSet>>([
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', text: 'I will check the' },
        { type: 'text-delta', id: '1', text: ' weather in Lon' },
        { type: 'text-delta', id: '1', text: 'don.' },
        {
          type: 'tool-input-start',
          toolName: 'weather',
          id: '2',
        },
        { type: 'tool-input-delta', id: '2', delta: '{ city: "London" }' },
        { type: 'tool-input-end', id: '2' },
        {
          type: 'tool-call',
          toolCallId: '1',
          toolName: 'weather',
          input: { city: 'London' },
        },
        { type: 'text-end', id: '1' },
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
            "id": "1",
            "type": "text-start",
          },
          "delay 10",
          {
            "id": "1",
            "text": "I ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "will ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "check ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "the ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "weather ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "in ",
            "type": "text-delta",
          },
          {
            "id": "1",
            "text": "London.",
            "type": "text-delta",
          },
          {
            "id": "2",
            "toolName": "weather",
            "type": "tool-input-start",
          },
          {
            "delta": "{ city: "London" }",
            "id": "2",
            "type": "tool-input-delta",
          },
          {
            "id": "2",
            "type": "tool-input-end",
          },
          {
            "input": {
              "city": "London",
            },
            "toolCallId": "1",
            "toolName": "weather",
            "type": "tool-call",
          },
          {
            "id": "1",
            "type": "text-end",
          },
        ]
      `);
    });

    it(`doesn't return chunks with just spaces`, async () => {
      const stream = convertArrayToReadableStream<TextStreamPart<ToolSet>>([
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', text: ' ' },
        { type: 'text-delta', id: '1', text: ' ' },
        { type: 'text-delta', id: '1', text: ' ' },
        { type: 'text-delta', id: '1', text: 'foo' },
        { type: 'text-end', id: '1' },
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
            "id": "1",
            "type": "text-start",
          },
          {
            "id": "1",
            "text": "   foo",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
        ]
      `);
    });
  });

  describe('line chunking', () => {
    it('should split text by lines when using line chunking mode', async () => {
      const stream = convertArrayToReadableStream<TextStreamPart<ToolSet>>([
        { type: 'text-start', id: '1' },
        {
          text: 'First line\nSecond line\nThird line with more text\n',
          type: 'text-delta',
          id: '1',
        },
        { text: 'Partial line', type: 'text-delta', id: '1' },
        { text: ' continues\nFinal line\n', type: 'text-delta', id: '1' },
        { type: 'text-end', id: '1' },
      ]).pipeThrough(
        smoothStream({
          delayInMs: 10,
          chunking: 'line',
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "type": "text-start",
          },
          "delay 10",
          {
            "id": "1",
            "text": "First line
        ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "Second line
        ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "Third line with more text
        ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "Partial line continues
        ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "Final line
        ",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
        ]
      `);
    });

    it('should handle text without line endings in line chunking mode', async () => {
      const stream = convertArrayToReadableStream<TextStreamPart<ToolSet>>([
        { type: 'text-start', id: '1' },
        { text: 'Text without', type: 'text-delta', id: '1' },
        { text: ' any line', type: 'text-delta', id: '1' },
        { text: ' breaks', type: 'text-delta', id: '1' },
        { type: 'text-end', id: '1' },
      ]).pipeThrough(
        smoothStream({
          chunking: 'line',
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "type": "text-start",
          },
          {
            "id": "1",
            "text": "Text without any line breaks",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
        ]
      `);
    });
  });

  describe('custom chunking', () => {
    it(`should return correct result for regexes that don't match from the exact start onwards`, async () => {
      const stream = convertArrayToReadableStream<TextStreamPart<ToolSet>>([
        { type: 'text-start', id: '1' },
        { text: 'Hello_, world!', type: 'text-delta', id: '1' },
        { type: 'text-end', id: '1' },
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
          {
            "id": "1",
            "type": "text-start",
          },
          "delay 10",
          {
            "id": "1",
            "text": "Hello_",
            "type": "text-delta",
          },
          {
            "id": "1",
            "text": ", world!",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
        ]
      `);
    });

    it('should support custom chunking regexps (character-level)', async () => {
      const stream = convertArrayToReadableStream<TextStreamPart<ToolSet>>([
        { type: 'text-start', id: '1' },
        { text: 'Hello, world!', type: 'text-delta', id: '1' },
        { type: 'text-end', id: '1' },
      ]).pipeThrough(
        smoothStream({
          chunking: /./,
          delayInMs: 10,
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "type": "text-start",
          },
          "delay 10",
          {
            "id": "1",
            "text": "H",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "e",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "l",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "l",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "o",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": ",",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": " ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "w",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "o",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "r",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "l",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "d",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "!",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
        ]
      `);
    });
  });

  describe('custom callback chunking', () => {
    it('should support custom chunking callback', async () => {
      const stream = convertArrayToReadableStream<TextStreamPart<ToolSet>>([
        { type: 'text-start', id: '1' },
        { text: 'He_llo, ', type: 'text-delta', id: '1' },
        { text: 'w_orld!', type: 'text-delta', id: '1' },
        { type: 'text-end', id: '1' },
      ]).pipeThrough(
        smoothStream({
          chunking: buffer => /[^_]*_/.exec(buffer)?.[0],
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "type": "text-start",
          },
          "delay 10",
          {
            "id": "1",
            "text": "He_",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "llo, w_",
            "type": "text-delta",
          },
          {
            "id": "1",
            "text": "orld!",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
        ]
      `);
    });

    describe('throws errors if the chunking function invalid matches', async () => {
      it('throws empty match error', async () => {
        const stream = convertArrayToReadableStream<TextStreamPart<ToolSet>>([
          { type: 'text-start', id: '1' },
          { text: 'Hello, world!', type: 'text-delta', id: '1' },
          { type: 'text-end', id: '1' },
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
        const stream = convertArrayToReadableStream<TextStreamPart<ToolSet>>([
          { type: 'text-start', id: '1' },
          { text: 'Hello, world!', type: 'text-delta', id: '1' },
          { type: 'text-end', id: '1' },
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
      const stream = convertArrayToReadableStream<TextStreamPart<ToolSet>>([
        { type: 'text-start', id: '1' },
        { text: 'Hello, world!', type: 'text-delta', id: '1' },
        { type: 'text-end', id: '1' },
      ]).pipeThrough(
        smoothStream({
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "type": "text-start",
          },
          "delay 10",
          {
            "id": "1",
            "text": "Hello, ",
            "type": "text-delta",
          },
          {
            "id": "1",
            "text": "world!",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
        ]
      `);
    });

    it('should support different number of milliseconds delay', async () => {
      const stream = convertArrayToReadableStream<TextStreamPart<ToolSet>>([
        { type: 'text-start', id: '1' },
        { text: 'Hello, world!', type: 'text-delta', id: '1' },
        { type: 'text-end', id: '1' },
      ]).pipeThrough(
        smoothStream({
          delayInMs: 20,
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "type": "text-start",
          },
          "delay 20",
          {
            "id": "1",
            "text": "Hello, ",
            "type": "text-delta",
          },
          {
            "id": "1",
            "text": "world!",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
        ]
      `);
    });

    it('should support null delay', async () => {
      const stream = convertArrayToReadableStream<TextStreamPart<ToolSet>>([
        { type: 'text-start', id: '1' },
        { text: 'Hello, world!', type: 'text-delta', id: '1' },
        { type: 'text-end', id: '1' },
      ]).pipeThrough(
        smoothStream({
          delayInMs: null,
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "type": "text-start",
          },
          "delay null",
          {
            "id": "1",
            "text": "Hello, ",
            "type": "text-delta",
          },
          {
            "id": "1",
            "text": "world!",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
        ]
      `);
    });
  });

  describe('text part id changes', () => {
    it('should change the id when the text part id changes', async () => {
      const stream = convertArrayToReadableStream<TextStreamPart<ToolSet>>([
        { type: 'text-start', id: '1' },
        { type: 'text-start', id: '2' },
        { text: 'I will check the', type: 'text-delta', id: '1' },
        { text: ' weather in Lon', type: 'text-delta', id: '1' },
        { text: 'don.', type: 'text-delta', id: '1' },
        { text: 'I will check the', type: 'text-delta', id: '2' },
        { text: ' weather in Lon', type: 'text-delta', id: '2' },
        { text: 'don.', type: 'text-delta', id: '2' },
        { type: 'text-end', id: '1' },
        { type: 'text-end', id: '2' },
      ]).pipeThrough(
        smoothStream({
          _internal: { delay },
        })({ tools: {} }),
      );

      await consumeStream(stream);

      expect(events).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "type": "text-start",
          },
          {
            "id": "2",
            "type": "text-start",
          },
          "delay 10",
          {
            "id": "1",
            "text": "I ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "will ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "check ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "the ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "weather ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "in ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "1",
            "text": "London.",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "2",
            "text": "I ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "2",
            "text": "will ",
            "type": "text-delta",
          },
          {
            "id": "2",
            "text": "check ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "2",
            "text": "the ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "2",
            "text": "weather ",
            "type": "text-delta",
          },
          "delay 10",
          {
            "id": "2",
            "text": "in ",
            "type": "text-delta",
          },
          {
            "id": "2",
            "text": "London.",
            "type": "text-delta",
          },
          {
            "id": "1",
            "type": "text-end",
          },
          {
            "id": "2",
            "type": "text-end",
          },
        ]
      `);
    });
  });
});
