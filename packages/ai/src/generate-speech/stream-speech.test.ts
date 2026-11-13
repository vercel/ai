import {
  UnsupportedFunctionalityError,
  type Experimental_SpeechModelV4StreamOptions as SpeechModelV4StreamOptions,
  type Experimental_SpeechModelV4StreamPart as SpeechModelV4StreamPart,
  type Experimental_SpeechModelV4StreamTextPart,
  type Experimental_StreamingSpeechModelV4,
} from '@ai-sdk/provider';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as logWarningsModule from '../logger/log-warnings';
import { MockSpeechModelV4 } from '../test/mock-speech-model-v4';
import { MockStreamingSpeechModelV4 } from '../test/mock-streaming-speech-model-v4';
import type { Experimental_SpeechTextPart } from './index';
import { streamSpeech } from './stream-speech';

vi.mock('../version', () => {
  return {
    VERSION: '0.0.0-test',
  };
});

const testDate = new Date(2024, 0, 1);
const mp3 = { type: 'audio/mpeg' };

const createStreamResponse = (
  parts: SpeechModelV4StreamPart[],
): Awaited<ReturnType<Experimental_StreamingSpeechModelV4['doStream']>> => ({
  stream: convertArrayToReadableStream(parts),
  response: {
    timestamp: testDate,
    modelId: 'test-model-id',
    headers: { 'x-test': 'value' },
  },
});

const basicParts: SpeechModelV4StreamPart[] = [
  { type: 'stream-start', warnings: [] },
  { type: 'audio', audio: new Uint8Array([1, 2]), audioFormat: mp3 },
  { type: 'audio', audio: 'AwQ=', audioFormat: mp3 },
  { type: 'finish', usage: { inputCharacters: 11 } },
];

describe('experimental_streamSpeech', () => {
  let logWarningsSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logWarningsSpy = vi
      .spyOn(logWarningsModule, 'logWarnings')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    logWarningsSpy.mockRestore();
  });

  it('should send args to doStream', async () => {
    const abortController = new AbortController();
    let capturedArgs: SpeechModelV4StreamOptions | undefined;

    const result = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async args => {
          capturedArgs = args;
          return createStreamResponse(basicParts);
        },
      }),
      text: 'Hello world',
      voice: 'voice-id',
      outputFormat: { type: 'audio/mpeg' },
      instructions: 'calm',
      speed: 1.1,
      language: 'en',
      providerOptions: { mock: { foo: 'bar' } },
      abortSignal: abortController.signal,
      headers: { 'custom-header': 'value' },
      includeRawChunks: true,
    });

    await result.usage;

    expect(capturedArgs).toMatchObject({
      voice: 'voice-id',
      outputFormat: { type: 'audio/mpeg' },
      instructions: 'calm',
      speed: 1.1,
      language: 'en',
      providerOptions: { mock: { foo: 'bar' } },
      headers: {
        'custom-header': 'value',
        'user-agent': 'ai/0.0.0-test',
      },
      includeRawChunks: true,
    });
    expect(capturedArgs?.abortSignal).toBeInstanceOf(AbortSignal);
  });

  const textPart = (text: string) => ({ type: 'text' as const, text });

  it.each([
    ['a string', () => 'Hello world', [textPart('Hello world')]],
    [
      'an async iterable',
      () =>
        (async function* () {
          yield 'Hello ';
          yield 'world';
        })(),
      [textPart('Hello '), textPart('world')],
    ],
    [
      'a readable stream',
      () => convertArrayToReadableStream(['Hello ', 'world']),
      [textPart('Hello '), textPart('world')],
    ],
    [
      'an array of strings and text parts',
      () => ['Hi. ', { type: 'text' as const, text: 'Hello. ', voice: 'bob' }],
      [textPart('Hi. '), { type: 'text', text: 'Hello. ', voice: 'bob' }],
    ],
    [
      'a sync iterable',
      () =>
        (function* () {
          yield 'Hello ';
          yield 'world';
        })(),
      [textPart('Hello '), textPart('world')],
    ],
    [
      'an async iterable of strings and text parts',
      () =>
        (async function* (): AsyncGenerator<
          string | Experimental_SpeechTextPart
        > {
          yield 'Hi. ';
          yield { type: 'text', text: 'Hello. ', voice: 'bob' };
        })(),
      [textPart('Hi. '), { type: 'text', text: 'Hello. ', voice: 'bob' }],
    ],
    [
      'a mix of strings and text parts',
      () =>
        convertArrayToReadableStream<string | Experimental_SpeechTextPart>([
          'Hi. ',
          {
            type: 'text',
            text: 'Hello. ',
            voice: 'bob',
            providerOptions: { mock: { newTurn: true } },
          },
        ]),
      [
        textPart('Hi. '),
        {
          type: 'text',
          text: 'Hello. ',
          voice: 'bob',
          providerOptions: { mock: { newTurn: true } },
        },
      ],
    ],
  ])(
    'should pass %s as a text part stream',
    async (_, createText, expected) => {
      let textChunks: Experimental_SpeechModelV4StreamTextPart[] = [];

      const result = streamSpeech({
        model: new MockStreamingSpeechModelV4({
          doStream: async args => {
            textChunks = await convertReadableStreamToArray(args.text);
            return createStreamResponse(basicParts);
          },
        }),
        text: createText(),
      });

      await result.usage;
      expect(textChunks).toEqual(expected);
    },
  );

  it('should stream audio bytes through audioStream', async () => {
    const result = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async () => createStreamResponse(basicParts),
      }),
      text: 'Hello world',
    });

    expect(await convertAsyncIterableToArray(result.audioStream)).toEqual([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
    ]);
    expect(await result.usage).toEqual({ inputCharacters: 11 });
  });

  it('should expose audio, raw and error parts through fullStream', async () => {
    const result = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'raw', rawValue: { audio: 'AQI=' } },
            {
              type: 'audio',
              id: 'a1',
              audio: 'AQI=',
              audioFormat: { type: 'audio/pcm', rate: 24000 },
              providerMetadata: { mock: { alignment: 'x' } },
            },
            { type: 'error', error: 'recoverable' },
            { type: 'finish', usage: {} },
          ]),
      }),
      text: 'Hello',
      includeRawChunks: true,
      onError: () => {},
    });

    expect(await convertAsyncIterableToArray(result.fullStream))
      .toMatchInlineSnapshot(`
      [
        {
          "rawValue": {
            "audio": "AQI=",
          },
          "type": "raw",
        },
        {
          "audio": Uint8Array [
            1,
            2,
          ],
          "audioFormat": {
            "rate": 24000,
            "type": "audio/pcm",
          },
          "id": "a1",
          "providerMetadata": {
            "mock": {
              "alignment": "x",
            },
          },
          "type": "audio",
        },
        {
          "error": "recoverable",
          "type": "error",
        },
      ]
    `);
  });

  it('should drop empty audio chunks', async () => {
    const result = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'audio', audio: '', audioFormat: mp3 },
            { type: 'audio', audio: new Uint8Array([9]), audioFormat: mp3 },
            { type: 'finish' },
          ]),
      }),
      text: 'Hi',
    });

    expect(await convertAsyncIterableToArray(result.audioStream)).toEqual([
      new Uint8Array([9]),
    ]);
  });

  it('should keep empty audio parts that carry provider metadata in fullStream only', async () => {
    const marker = { mock: { isFinalAudioForTurn: true } };
    const parts = [
      { type: 'stream-start', warnings: [] },
      { type: 'audio', audio: new Uint8Array([9]), audioFormat: mp3 },
      { type: 'audio', audio: '', audioFormat: mp3, providerMetadata: marker },
      { type: 'finish' },
    ] satisfies SpeechModelV4StreamPart[];
    const model = () =>
      new MockStreamingSpeechModelV4({
        doStream: async () => createStreamResponse(parts),
      });

    const full = await convertAsyncIterableToArray(
      streamSpeech({ model: model(), text: 'Hi' }).fullStream,
    );
    expect(full.filter(part => part.type === 'audio')).toEqual([
      { type: 'audio', audio: new Uint8Array([9]), audioFormat: mp3 },
      {
        type: 'audio',
        audio: new Uint8Array(),
        audioFormat: mp3,
        providerMetadata: marker,
      },
    ]);
    expect(
      await convertAsyncIterableToArray(
        streamSpeech({ model: model(), text: 'Hi' }).audioStream,
      ),
    ).toEqual([new Uint8Array([9])]);
  });

  it('should not count metadata-only audio parts as audio', async () => {
    const result = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            {
              type: 'audio',
              audio: '',
              audioFormat: mp3,
              providerMetadata: { mock: { marker: true } },
            },
            { type: 'finish' },
          ]),
      }),
      text: 'Hi',
    });
    await expect(result.usage).rejects.toMatchObject({
      name: 'AI_NoSpeechGeneratedError',
    });
  });

  it('should resolve result promises', async () => {
    const result = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async () =>
          createStreamResponse([
            {
              type: 'stream-start',
              warnings: [{ type: 'other', message: 'warning' }],
            },
            {
              type: 'response-metadata',
              modelId: 'resolved-model',
              timestamp: new Date(2024, 0, 2),
            },
            { type: 'audio', audio: new Uint8Array([1]), audioFormat: mp3 },
            {
              type: 'finish',
              usage: { inputCharacters: 2 },
              providerMetadata: { mock: { requestId: 'r1' } },
            },
          ]),
      }),
      text: 'Hi',
    });

    expect(await result.warnings).toEqual([
      { type: 'other', message: 'warning' },
    ]);
    expect(await result.usage).toEqual({ inputCharacters: 2 });
    expect(await result.providerMetadata).toEqual({
      mock: { requestId: 'r1' },
    });
    expect(await result.responses).toEqual([
      {
        timestamp: new Date(2024, 0, 2),
        modelId: 'resolved-model',
        headers: { 'x-test': 'value' },
      },
    ]);
    expect(logWarningsSpy).toHaveBeenCalledWith({
      warnings: [{ type: 'other', message: 'warning' }],
      provider: 'mock-provider',
      model: 'mock-model-id',
    });
  });

  it('should reject when the stream finishes without audio', async () => {
    const result = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'finish' },
          ]),
      }),
      text: 'Hi',
    });

    await expect(result.usage).rejects.toMatchObject({
      name: 'AI_NoSpeechGeneratedError',
    });
  });

  it('should reject with no-speech when the stream ends without audio or a finish part', async () => {
    const result = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async () =>
          createStreamResponse([{ type: 'stream-start', warnings: [] }]),
      }),
      text: 'Hi',
    });

    await expect(
      convertAsyncIterableToArray(result.audioStream),
    ).rejects.toMatchObject({ name: 'AI_NoSpeechGeneratedError' });
  });

  it('should skip error parts in audioStream and report them through onError', async () => {
    const onError = vi.fn();
    const result = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'audio', audio: new Uint8Array([1]), audioFormat: mp3 },
            { type: 'error', error: 'recoverable' },
            { type: 'audio', audio: new Uint8Array([2]), audioFormat: mp3 },
            { type: 'finish', usage: { inputCharacters: 2 } },
          ]),
      }),
      text: 'Hi',
      onError,
    });

    expect(await convertAsyncIterableToArray(result.audioStream)).toEqual([
      new Uint8Array([1]),
      new Uint8Array([2]),
    ]);
    expect(await result.usage).toEqual({ inputCharacters: 2 });
    expect(onError).toHaveBeenCalledWith({ error: 'recoverable' });
  });

  it('should log error parts with console.error by default', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    try {
      const result = streamSpeech({
        model: new MockStreamingSpeechModelV4({
          doStream: async () =>
            createStreamResponse([
              { type: 'stream-start', warnings: [] },
              { type: 'error', error: 'recoverable' },
              ...basicParts.slice(1),
            ]),
        }),
        text: 'Hi',
      });
      await result.usage;
      await vi.waitFor(() =>
        expect(consoleError).toHaveBeenCalledWith('recoverable'),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it.each([
    [
      'throws',
      () => {
        throw new Error('handler failed');
      },
    ],
    ['rejects', () => Promise.reject(new Error('handler failed'))],
  ])('should keep streaming when onError %s', async (_, onError) => {
    const result = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'error', error: 'recoverable' },
            ...basicParts.slice(1),
          ]),
      }),
      text: 'Hi',
      onError,
    });
    expect(await convertAsyncIterableToArray(result.audioStream)).toHaveLength(
      2,
    );
    expect(await result.usage).toEqual({ inputCharacters: 11 });
  });

  it('should reject result promises and error the output on a user abort while doStream is pending', async () => {
    const abortController = new AbortController();
    const result = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        // A provider that ignores the abort signal.
        doStream: () => new Promise(() => {}),
      }),
      text: 'Hi',
      abortSignal: abortController.signal,
    });
    const reader = result.fullStream.getReader();
    const usage = result.usage;
    const read = reader.read();
    abortController.abort(new Error('user abort'));
    await expect(usage).rejects.toThrow('user abort');
    await expect(read).rejects.toThrow('user abort');
  });

  it('should accept a readonly array of text parts directly', async () => {
    const script = [
      { type: 'text', text: 'Did you hear? ', voice: 'alice' },
      { type: 'text', text: 'No, what?', voice: 'bob' },
    ] as const;
    let textChunks: Experimental_SpeechModelV4StreamTextPart[] = [];

    const result = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async args => {
          textChunks = await convertReadableStreamToArray(args.text);
          return createStreamResponse(basicParts);
        },
      }),
      text: script,
    });

    await result.usage;
    expect(textChunks).toEqual(script);
  });

  it('should surface the provider error when the stream ends after audio without finishing', async () => {
    const upstream = new Error('upstream failed');
    const result = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'audio', audio: new Uint8Array([1]), audioFormat: mp3 },
            { type: 'error', error: upstream },
          ]),
      }),
      text: 'Hi',
      onError: () => {},
    });

    await expect(convertAsyncIterableToArray(result.audioStream)).rejects.toBe(
      upstream,
    );
  });

  it('should fail with a stream error, not no-speech, when audio was streamed but no finish arrived', async () => {
    const result = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'audio', audio: new Uint8Array([1]), audioFormat: mp3 },
          ]),
      }),
      text: 'Hi',
    });

    await expect(result.usage).rejects.toMatchObject({
      name: 'AI_StreamProviderError',
      message: 'The speech stream ended before it finished.',
    });
  });

  it('should not throw when breaking out of fullStream early', async () => {
    const result = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async () => ({
          stream: new ReadableStream<SpeechModelV4StreamPart>({
            start(controller) {
              controller.enqueue({ type: 'stream-start', warnings: [] });
              controller.enqueue({
                type: 'audio',
                audio: new Uint8Array([1]),
                audioFormat: mp3,
              });
            },
          }),
        }),
      }),
      text: 'Hi',
    });

    for await (const part of result.fullStream) {
      expect(part.type).toBe('audio');
      break;
    }
  });

  it('should reject result promises and cancel the text when doStream rejects', async () => {
    const cancel = vi.fn();
    const text = new ReadableStream<string>({ cancel });

    const result = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async () => {
          throw new Error('connect failed');
        },
      }),
      text,
    });

    await expect(result.usage).rejects.toThrow('connect failed');
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
  });

  it('should abort the model call when fullStream is cancelled', async () => {
    let signal: AbortSignal | undefined;
    const cancelModelStream = vi.fn();

    const result = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async args => {
          signal = args.abortSignal;
          return {
            stream: new ReadableStream<SpeechModelV4StreamPart>({
              start(controller) {
                controller.enqueue({ type: 'stream-start', warnings: [] });
                controller.enqueue({
                  type: 'audio',
                  audio: new Uint8Array([1]),
                  audioFormat: mp3,
                });
              },
              cancel: cancelModelStream,
            }),
          };
        },
      }),
      text: 'Hi',
    });

    const reader = result.fullStream.getReader();
    await reader.read();
    await reader.cancel('done');

    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
    await vi.waitFor(() => expect(cancelModelStream).toHaveBeenCalled());
  });

  it('should preserve the response body from doStream and response-metadata parts', async () => {
    const fromDoStream = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async () => ({
          ...createStreamResponse(basicParts),
          response: { modelId: 'test-model-id', body: { setup: true } },
        }),
      }),
      text: 'Hi',
    });
    expect((await fromDoStream.responses)[0].body).toEqual({ setup: true });

    const fromPart = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'response-metadata', body: { final: true } },
            ...basicParts.slice(1),
          ]),
      }),
      text: 'Hi',
    });
    expect((await fromPart.responses)[0].body).toEqual({ final: true });
  });

  describe('cancellation while doStream is pending', () => {
    // A provider that never reacts to the abort signal.
    const hangingModel = () => {
      let signal: AbortSignal | undefined;
      const model = new MockStreamingSpeechModelV4({
        doStream: args => {
          signal = args.abortSignal;
          return new Promise(() => {});
        },
      });
      return { model, signal: () => signal };
    };

    it('should reject result promises when fullStream is cancelled', async () => {
      const { model, signal } = hangingModel();
      const result = streamSpeech({ model, text: 'Hi' });

      const stream = result.fullStream;
      const usage = result.usage;
      await stream.cancel('stop');

      await expect(usage).rejects.toBe('stop');
      await expect(result.responses).rejects.toBe('stop');
      expect(signal()?.aborted).toBe(true);
    });

    it('should reject result promises when audioStream is cancelled', async () => {
      const { model, signal } = hangingModel();
      const result = streamSpeech({ model, text: 'Hi' });

      const stream = result.audioStream;
      const usage = result.usage;
      await stream.cancel('stop');

      await expect(usage).rejects.toBe('stop');
      await expect(result.providerMetadata).rejects.toBe('stop');
      expect(signal()?.aborted).toBe(true);
    });
  });

  it('should keep a preceding error part as the cause of a no-audio failure', async () => {
    const upstream = new Error('voice not found');
    const finishing = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'error', error: upstream },
            { type: 'finish' },
          ]),
      }),
      text: 'Hi',
      onError: () => {},
    });
    await expect(finishing.usage).rejects.toMatchObject({
      name: 'AI_NoSpeechGeneratedError',
      cause: upstream,
    });

    const ending = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'error', error: upstream },
          ]),
      }),
      text: 'Hi',
      onError: () => {},
    });
    await expect(ending.usage).rejects.toMatchObject({
      name: 'AI_NoSpeechGeneratedError',
      cause: upstream,
    });
  });

  it('should cancel the model stream without unhandled rejections when audioStream is cancelled early', async () => {
    const cancelModelStream = vi.fn();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const result = streamSpeech({
        model: new MockStreamingSpeechModelV4({
          doStream: async () => ({
            stream: new ReadableStream<SpeechModelV4StreamPart>({
              start(controller) {
                controller.enqueue({ type: 'stream-start', warnings: [] });
                controller.enqueue({
                  type: 'audio',
                  audio: new Uint8Array([1]),
                  audioFormat: mp3,
                });
              },
              cancel: cancelModelStream,
            }),
          }),
        }),
        text: 'Hi',
      });

      for await (const chunk of result.audioStream) {
        expect(chunk).toEqual(new Uint8Array([1]));
        break;
      }

      await vi.waitFor(() => expect(cancelModelStream).toHaveBeenCalled());
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('should allow only one stream owner', () => {
    const result = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async () => createStreamResponse(basicParts),
      }),
      text: 'Hi',
    });

    void result.fullStream;
    expect(() => result.audioStream).toThrow(
      'Only one of audioStream or fullStream can be accessed, and only once.',
    );
  });

  it('should not allow stream access after a result promise', () => {
    const result = streamSpeech({
      model: new MockStreamingSpeechModelV4({
        doStream: async () => createStreamResponse(basicParts),
      }),
      text: 'Hi',
    });

    void result.usage;
    expect(() => result.fullStream).toThrow(
      'fullStream cannot be accessed after a result promise.',
    );
  });

  it('should throw when the model does not support streaming', () => {
    expect(() =>
      streamSpeech({
        model: new MockSpeechModelV4(),
        text: 'Hi',
      }),
    ).toThrow(UnsupportedFunctionalityError);
  });
});
