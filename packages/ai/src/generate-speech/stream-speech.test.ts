import {
  UnsupportedFunctionalityError,
  type Experimental_SpeechModelV4StreamOptions as SpeechModelV4StreamOptions,
  type Experimental_SpeechModelV4StreamPart as SpeechModelV4StreamPart,
  type SpeechModelV4,
} from '@ai-sdk/provider';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as logWarningsModule from '../logger/log-warnings';
import { MockSpeechModelV4 } from '../test/mock-speech-model-v4';
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
): Awaited<ReturnType<NonNullable<SpeechModelV4['doStream']>>> => ({
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
      model: new MockSpeechModelV4({
        doStream: async args => {
          capturedArgs = args;
          return createStreamResponse(basicParts);
        },
      }),
      text: 'Hello world',
      voice: 'voice-id',
      outputFormat: 'mp3',
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
      outputFormat: 'mp3',
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

  it.each([
    ['a string', () => 'Hello world', ['Hello world']],
    [
      'an async iterable',
      () =>
        (async function* () {
          yield 'Hello ';
          yield 'world';
        })(),
      ['Hello ', 'world'],
    ],
    [
      'a readable stream',
      () => convertArrayToReadableStream(['Hello ', 'world']),
      ['Hello ', 'world'],
    ],
  ])('should pass %s as a text stream', async (_, createText, expected) => {
    let textChunks: string[] = [];

    const result = streamSpeech({
      model: new MockSpeechModelV4({
        doStream: async args => {
          textChunks = await convertReadableStreamToArray(args.text);
          return createStreamResponse(basicParts);
        },
      }),
      text: createText(),
    });

    await result.usage;
    expect(textChunks).toEqual(expected);
  });

  it('should stream audio bytes through audioStream', async () => {
    const result = streamSpeech({
      model: new MockSpeechModelV4({
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
      model: new MockSpeechModelV4({
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
      model: new MockSpeechModelV4({
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

  it('should resolve result promises', async () => {
    const result = streamSpeech({
      model: new MockSpeechModelV4({
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
      model: new MockSpeechModelV4({
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

  it('should reject when the stream ends without a finish part', async () => {
    const result = streamSpeech({
      model: new MockSpeechModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'audio', audio: new Uint8Array([1]), audioFormat: mp3 },
          ]),
      }),
      text: 'Hi',
    });

    await expect(
      convertAsyncIterableToArray(result.audioStream),
    ).rejects.toMatchObject({ name: 'AI_NoSpeechGeneratedError' });
  });

  it('should error audioStream on an error part', async () => {
    const result = streamSpeech({
      model: new MockSpeechModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'audio', audio: new Uint8Array([1]), audioFormat: mp3 },
            { type: 'error', error: new Error('upstream failed') },
          ]),
      }),
      text: 'Hi',
    });

    await expect(
      convertAsyncIterableToArray(result.audioStream),
    ).rejects.toThrow('upstream failed');
  });

  it('should reject result promises and cancel the text when doStream rejects', async () => {
    const cancel = vi.fn();
    const text = new ReadableStream<string>({ cancel });

    const result = streamSpeech({
      model: new MockSpeechModelV4({
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
      model: new MockSpeechModelV4({
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

  it('should allow only one stream owner', () => {
    const result = streamSpeech({
      model: new MockSpeechModelV4({
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
      model: new MockSpeechModelV4({
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
