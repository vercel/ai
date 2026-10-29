import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { readUIMessageStream } from '../ui-message-stream/read-ui-message-stream';
import type { UIMessageChunk } from '../ui-message-stream/ui-message-chunks';
import type { UIMessage } from './ui-messages';

const start = (toolCallId = 'call', dynamic = false): UIMessageChunk => ({
  type: 'tool-input-start',
  toolCallId,
  toolName: 'search',
  dynamic,
});
const delta = (
  inputTextDelta: string,
  toolCallId = 'call',
): UIMessageChunk => ({
  type: 'tool-input-delta',
  toolCallId,
  inputTextDelta,
});
const complete = (toolCallId = 'call', dynamic = false): UIMessageChunk => ({
  type: 'tool-input-available',
  toolCallId,
  toolName: 'search',
  dynamic,
  input: { final: true },
});
const parserFactory = () => {
  const parsers: {
    push: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }[] = [];
  const factory = vi.fn(() => {
    let text = '';
    const parser = {
      push: vi.fn((delta: string) => ({ partial: (text += delta) })),
      dispose: vi.fn(),
    };
    parsers.push(parser);
    return parser;
  });
  return { factory, parsers };
};
const collect = async (stream: AsyncIterable<UIMessage>) => {
  const messages: UIMessage[] = [];
  for await (const message of stream) messages.push(message);
  return messages;
};

describe('custom tool input parser', () => {
  it.each([false, true])(
    'receives only deltas and preserves final input (dynamic: %s)',
    async dynamic => {
      const { factory, parsers } = parserFactory();
      const messages = await collect(
        readUIMessageStream({
          stream: convertArrayToReadableStream([
            start('call', dynamic),
            delta('{'),
            delta('"a":1}'),
            complete('call', dynamic),
          ]),
          experimental_createToolInputParser: factory,
          terminateOnError: true,
        }),
      );
      expect(factory).toHaveBeenCalledTimes(1);
      expect(parsers[0].push.mock.calls).toEqual([['{'], ['"a":1}']]);
      expect(parsers[0].dispose).toHaveBeenCalledTimes(1);
      expect(messages[1].parts[0]).toMatchObject({
        state: 'input-streaming',
        input: { partial: '{' },
        rawInput: '{',
      });
      expect(messages[2].parts[0]).toMatchObject({
        input: { partial: '{"a":1}' },
      });
      expect(messages.at(-1)?.parts[0]).toMatchObject({
        state: 'input-available',
        input: { final: true },
      });
    },
  );

  it('isolates interleaved calls, including special property names', async () => {
    const { factory, parsers } = parserFactory();
    await collect(
      readUIMessageStream({
        stream: convertArrayToReadableStream([
          start('__proto__'),
          start('constructor'),
          delta('a', '__proto__'),
          delta('b', 'constructor'),
          delta('c', '__proto__'),
        ]),
        experimental_createToolInputParser: factory,
      }),
    );
    expect(parsers.map(p => p.push.mock.calls)).toEqual([
      [['a'], ['c']],
      [['b']],
    ]);
    for (const parser of parsers)
      expect(parser.dispose).toHaveBeenCalledTimes(1);
  });

  it('rehydrates a resumed parser once from rawInput', async () => {
    const { factory, parsers } = parserFactory();
    await collect(
      readUIMessageStream({
        message: {
          id: 'message',
          role: 'assistant',
          parts: [
            {
              type: 'tool-search',
              toolCallId: 'call',
              state: 'input-streaming',
              rawInput: '{"a":',
              input: {},
            },
          ],
        },
        stream: convertArrayToReadableStream([delta('1'), delta('}')]),
        experimental_createToolInputParser: factory,
      }),
    );
    expect(parsers[0].push.mock.calls).toEqual([['{"a":'], ['1'], ['}']]);
    expect(parsers[0].dispose).toHaveBeenCalledTimes(1);
  });

  it('bypasses the JSON parser for text input and complete-only calls', async () => {
    const { factory } = parserFactory();
    const messages = await collect(
      readUIMessageStream({
        stream: convertArrayToReadableStream([
          { ...start(), inputEncoding: 'text' },
          delta('code('),
          complete(),
          complete('other'),
        ]),
        experimental_createToolInputParser: factory,
      }),
    );
    expect(factory).not.toHaveBeenCalled();
    expect(messages[1].parts[0]).toMatchObject({
      inputEncoding: 'text',
      input: 'code(',
      rawInput: 'code(',
    });
  });

  it.each<UIMessageChunk>([
    { type: 'reset-step' },
    { type: 'start', messageId: 'next' },
    start(),
    {
      type: 'tool-input-error',
      toolCallId: 'call',
      toolName: 'search',
      input: null,
      errorText: 'invalid input',
    },
  ])('releases the parser on $type', async event => {
    const { factory, parsers } = parserFactory();
    await collect(
      readUIMessageStream({
        stream: convertArrayToReadableStream([start(), delta('{'), event]),
        experimental_createToolInputParser: factory,
        terminateOnError: true,
      }),
    );
    expect(parsers[0].dispose).toHaveBeenCalledTimes(1);
  });

  it('propagates parser failures and releases its resources', async () => {
    const error = new SyntaxError('invalid JSON');
    const dispose = vi.fn();
    await expect(
      collect(
        readUIMessageStream({
          stream: convertArrayToReadableStream([start(), delta('invalid')]),
          experimental_createToolInputParser: () => ({
            push: () => {
              throw error;
            },
            dispose,
          }),
          terminateOnError: true,
        }),
      ),
    ).rejects.toBe(error);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('releases parsers on an error envelope while the source remains open', async () => {
    const { factory, parsers } = parserFactory();
    let input!: ReadableStreamDefaultController<UIMessageChunk>;
    const reader = readUIMessageStream({
      stream: new ReadableStream({
        start(controller) {
          input = controller;
        },
      }),
      experimental_createToolInputParser: factory,
      terminateOnError: true,
    }).getReader();
    input.enqueue(start());
    input.enqueue(delta('{'));
    await reader.read();
    await reader.read();
    input.enqueue({ type: 'error', errorText: 'provider failed' });
    await expect(reader.read()).rejects.toThrow('provider failed');
    expect(parsers[0].dispose).toHaveBeenCalledTimes(1);
    input.close();
  });

  it('releases parsers before a slow source cancellation completes', async () => {
    const { factory, parsers } = parserFactory();
    let input!: ReadableStreamDefaultController<UIMessageChunk>;
    let finishCancel!: () => void;
    const cancelled = new Promise<void>(resolve => {
      finishCancel = resolve;
    });
    const reader = readUIMessageStream({
      stream: new ReadableStream({
        start(controller) {
          input = controller;
        },
        cancel: () => cancelled,
      }),
      experimental_createToolInputParser: factory,
    }).getReader();
    input.enqueue(start());
    input.enqueue(delta('{'));
    await reader.read();
    await reader.read();
    await reader.cancel();
    try {
      await vi.waitFor(() =>
        expect(parsers[0].dispose).toHaveBeenCalledTimes(1),
      );
    } finally {
      finishCancel();
    }
  });

  it.each(['cancel', 'error'] as const)(
    'releases an unfinished parser on %s',
    async exit => {
      const { factory, parsers } = parserFactory();
      let input!: ReadableStreamDefaultController<UIMessageChunk>;
      const cancelled = vi.fn();
      const stream = readUIMessageStream({
        stream: new ReadableStream({
          start(controller) {
            input = controller;
          },
          cancel: cancelled,
        }),
        experimental_createToolInputParser: factory,
        terminateOnError: true,
      });
      const reader = stream.getReader();
      input.enqueue(start());
      input.enqueue(delta('{'));
      await reader.read();
      await reader.read();
      if (exit === 'cancel') {
        await reader.cancel();
        await vi.waitFor(() => expect(cancelled).toHaveBeenCalledTimes(1));
      } else {
        const error = new Error('connection failed');
        input.error(error);
        await expect(reader.read()).rejects.toBe(error);
      }
      await vi.waitFor(() =>
        expect(parsers[0].dispose).toHaveBeenCalledTimes(1),
      );
    },
  );
});
