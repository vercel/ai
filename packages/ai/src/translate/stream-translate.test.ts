import type {
  Experimental_SpeechTranslationModelV4 as SpeechTranslationModelV4,
  Experimental_SpeechTranslationModelV4StreamPart as SpeechTranslationModelV4StreamPart,
} from '@ai-sdk/provider';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vitest,
  vi,
} from 'vitest';
import * as logWarningsModule from '../logger/log-warnings';
import { MockSpeechTranslationModelV4 } from '../test/mock-speech-translation-model-v4';
import { streamTranslate } from './stream-translate';

vi.mock('../version', () => {
  return {
    VERSION: '0.0.0-test',
  };
});

const audio = convertArrayToReadableStream([new Uint8Array([1, 2, 3])]);
const inputAudioFormat = { type: 'audio/pcm', rate: 16000 };
const targetLanguage = 'es';
const testDate = new Date(2024, 0, 1);

const createStreamResponse = (
  parts: SpeechTranslationModelV4StreamPart[],
): Awaited<ReturnType<SpeechTranslationModelV4['doStream']>> => ({
  stream: convertArrayToReadableStream(parts),
  response: {
    timestamp: testDate,
    modelId: 'test-model-id',
    headers: { 'x-test': 'value' },
  },
});

describe('experimental_streamTranslate', () => {
  let logWarningsSpy: ReturnType<typeof vitest.spyOn>;

  beforeEach(() => {
    logWarningsSpy = vitest
      .spyOn(logWarningsModule, 'logWarnings')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    logWarningsSpy.mockRestore();
  });

  it('should send args to doStream', async () => {
    const abortController = new AbortController();
    const abortSignal = abortController.signal;
    let capturedArgs!: Parameters<SpeechTranslationModelV4['doStream']>[0];

    const result = streamTranslate({
      model: new MockSpeechTranslationModelV4({
        doStream: async args => {
          capturedArgs = args;
          return createStreamResponse([
            { type: 'stream-start', warnings: [] },
            {
              type: 'finish',
              sourceText: 'Hello world',
              outputText: 'Hola mundo',
            },
          ]);
        },
      }),
      audio,
      inputAudioFormat,
      targetLanguage,
      sourceLanguage: 'en',
      outputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      providerOptions: { mock: { option: 'value' } },
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
      includeRawChunks: true,
    });

    await convertAsyncIterableToArray(result.fullStream);

    const { abortSignal: capturedSignal, ...capturedRest } = capturedArgs;
    expect(capturedRest).toStrictEqual({
      audio,
      inputAudioFormat,
      targetLanguage: 'es',
      sourceLanguage: 'en',
      outputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      providerOptions: { mock: { option: 'value' } },
      headers: {
        'custom-request-header': 'request-header-value',
        'user-agent': 'ai/0.0.0-test',
      },
      includeRawChunks: true,
    });
    // the model receives a merged signal that follows the caller's signal
    expect(capturedSignal?.aborted).toBe(false);
    abortController.abort();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('should stream translation parts and resolve final metadata', async () => {
    const result = streamTranslate({
      model: new MockSpeechTranslationModelV4({
        doStream: async () =>
          createStreamResponse([
            {
              type: 'stream-start',
              warnings: [{ type: 'other', message: 'test warning' }],
            },
            {
              type: 'source-transcript-delta',
              id: 'item-1',
              delta: 'Hel',
            },
            {
              type: 'source-transcript-partial',
              id: 'item-1',
              text: 'Hello',
              startSecond: 0,
              endSecond: 1,
              channelIndex: 0,
            },
            {
              type: 'source-transcript-final',
              id: 'item-1',
              text: 'Hello',
              startSecond: 0,
              endSecond: 1,
              channelIndex: 0,
            },
            { type: 'output-text-delta', id: 'item-1', delta: 'Ho' },
            { type: 'output-text-delta', id: 'item-1', delta: 'la' },
            { type: 'output-text-final', id: 'item-1', text: 'Hola' },
            {
              type: 'audio',
              id: 'item-1',
              audio: new Uint8Array([4, 5, 6]),
            },
            {
              type: 'finish',
              sourceText: 'Hello',
              outputText: 'Hola',
              durationInSeconds: 1,
              usage: {
                inputAudioSeconds: 1,
                inputAudioTokens: 10,
                outputAudioTokens: 20,
                inputTextTokens: 2,
                outputTextTokens: 3,
              },
              providerMetadata: { mock: { key: 'value' } },
            },
          ]),
      }),
      audio,
      inputAudioFormat,
      targetLanguage,
    });

    await expect(
      convertAsyncIterableToArray(result.fullStream),
    ).resolves.toEqual([
      { type: 'source-transcript-delta', id: 'item-1', delta: 'Hel' },
      {
        type: 'source-transcript-partial',
        id: 'item-1',
        text: 'Hello',
        startSecond: 0,
        endSecond: 1,
        channelIndex: 0,
      },
      {
        type: 'source-transcript-final',
        id: 'item-1',
        text: 'Hello',
        startSecond: 0,
        endSecond: 1,
        channelIndex: 0,
      },
      { type: 'output-text-delta', id: 'item-1', delta: 'Ho' },
      { type: 'output-text-delta', id: 'item-1', delta: 'la' },
      { type: 'output-text-final', id: 'item-1', text: 'Hola' },
      { type: 'audio', id: 'item-1', audio: new Uint8Array([4, 5, 6]) },
    ]);
    await expect(result.sourceText).resolves.toBe('Hello');
    await expect(result.translationText).resolves.toBe('Hola');
    await expect(result.durationInSeconds).resolves.toBe(1);
    await expect(result.usage).resolves.toEqual({
      inputAudioSeconds: 1,
      inputAudioTokens: 10,
      outputAudioTokens: 20,
      inputTextTokens: 2,
      outputTextTokens: 3,
    });
    await expect(result.warnings).resolves.toEqual([
      { type: 'other', message: 'test warning' },
    ]);
    await expect(result.response).resolves.toEqual({
      timestamp: testDate,
      modelId: 'test-model-id',
      headers: { 'x-test': 'value' },
    });
    await expect(result.providerMetadata).resolves.toEqual({
      mock: { key: 'value' },
    });
    expect(logWarningsSpy).toHaveBeenCalledWith({
      warnings: [{ type: 'other', message: 'test warning' }],
      provider: 'mock-provider',
      model: 'mock-model-id',
    });
  });

  it('should pass raw chunks through when includeRawChunks is enabled', async () => {
    const result = streamTranslate({
      model: new MockSpeechTranslationModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'raw', rawValue: { event: 'provider-event' } },
            {
              type: 'finish',
              sourceText: 'Hello',
              outputText: 'Hola',
            },
          ]),
      }),
      audio,
      inputAudioFormat,
      targetLanguage,
      includeRawChunks: true,
    });

    await expect(
      convertAsyncIterableToArray(result.fullStream),
    ).resolves.toEqual([
      { type: 'raw', rawValue: { event: 'provider-event' } },
    ]);
  });

  it('should reject final promises when no translation is returned', async () => {
    const result = streamTranslate({
      model: new MockSpeechTranslationModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'finish', sourceText: 'Hello', outputText: '' },
          ]),
      }),
      audio,
      inputAudioFormat,
      targetLanguage,
    });

    await expect(
      convertAsyncIterableToArray(result.fullStream),
    ).rejects.toMatchObject({
      name: 'AI_NoTranslationGeneratedError',
      message: 'No translation generated.',
    });
    await expect(result.translationText).rejects.toMatchObject({
      name: 'AI_NoTranslationGeneratedError',
      response: {
        timestamp: testDate,
        modelId: 'test-model-id',
      },
    });
  });

  it('should keep already-resolved promises resolved when the stream errors later', async () => {
    const result = streamTranslate({
      model: new MockSpeechTranslationModelV4({
        doStream: async () =>
          createStreamResponse([
            {
              type: 'stream-start',
              warnings: [{ type: 'other', message: 'test warning' }],
            },
            { type: 'finish', sourceText: '', outputText: '' },
          ]),
      }),
      audio,
      inputAudioFormat,
      targetLanguage,
    });

    await expect(
      convertAsyncIterableToArray(result.fullStream),
    ).rejects.toMatchObject({
      name: 'AI_NoTranslationGeneratedError',
    });

    // warnings resolved at stream-start and must not flip to rejected:
    await expect(result.warnings).resolves.toEqual([
      { type: 'other', message: 'test warning' },
    ]);
    await expect(result.translationText).rejects.toMatchObject({
      name: 'AI_NoTranslationGeneratedError',
    });
  });

  it('should cancel the audio stream when doStream rejects', async () => {
    let audioCancelReason: unknown;
    const audioStream = new ReadableStream<Uint8Array>({
      cancel(reason) {
        audioCancelReason = reason;
      },
    });

    const result = streamTranslate({
      model: new MockSpeechTranslationModelV4({
        doStream: async () => {
          throw new Error('authentication failed');
        },
      }),
      audio: audioStream,
      inputAudioFormat,
      targetLanguage,
    });

    await expect(
      convertAsyncIterableToArray(result.fullStream),
    ).rejects.toThrow('authentication failed');
    await expect(result.translationText).rejects.toThrow(
      'authentication failed',
    );
    await vi.waitFor(() => {
      expect(audioCancelReason).toMatchObject({
        message: 'authentication failed',
      });
    });
  });

  it('should not interfere with a model-owned audio stream when the model stream errors mid-pipe', async () => {
    let audioReaderTaken = false;
    const audioStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
      },
    });

    const result = streamTranslate({
      model: new MockSpeechTranslationModelV4({
        doStream: async ({ audio: modelAudio }) => {
          // the model takes ownership of the audio stream, as providers do:
          void modelAudio.getReader();
          audioReaderTaken = true;
          return {
            stream: new ReadableStream<SpeechTranslationModelV4StreamPart>({
              start(controller) {
                controller.enqueue({ type: 'stream-start', warnings: [] });
                controller.error(new Error('connection lost'));
              },
            }),
            response: { timestamp: testDate, modelId: 'test-model-id' },
          };
        },
      }),
      audio: audioStream,
      inputAudioFormat,
      targetLanguage,
    });

    await expect(
      convertAsyncIterableToArray(result.fullStream),
    ).rejects.toThrow('connection lost');
    expect(audioReaderTaken).toBe(true);
    await expect(result.translationText).rejects.toThrow('connection lost');
  });

  it('should cancel the model stream when fullStream is cancelled early', async () => {
    let modelStreamCancelled = false;

    const result = streamTranslate({
      model: new MockSpeechTranslationModelV4({
        doStream: async () => ({
          stream: new ReadableStream<SpeechTranslationModelV4StreamPart>({
            start(controller) {
              controller.enqueue({ type: 'stream-start', warnings: [] });
              controller.enqueue({
                type: 'output-text-delta',
                id: 'item-1',
                delta: 'Ho',
              });
              controller.enqueue({
                type: 'output-text-delta',
                id: 'item-1',
                delta: 'la',
              });
            },
            cancel() {
              modelStreamCancelled = true;
            },
          }),
          response: { timestamp: testDate, modelId: 'test-model-id' },
        }),
      }),
      audio,
      inputAudioFormat,
      targetLanguage,
    });

    for await (const part of result.fullStream) {
      expect(part.type).toBe('output-text-delta');
      break;
    }

    await vi.waitFor(() => {
      expect(modelStreamCancelled).toBe(true);
    });
    await expect(result.translationText).rejects.toThrow();
  });

  it('should abort a still-pending doStream when fullStream is cancelled', async () => {
    let observedSignal: AbortSignal | undefined;

    const result = streamTranslate({
      model: new MockSpeechTranslationModelV4({
        doStream: ({ abortSignal }) => {
          observedSignal = abortSignal;
          return new Promise(() => {}); // setup that never completes
        },
      }),
      audio: new ReadableStream(),
      inputAudioFormat,
      targetLanguage,
    });

    await result.fullStream.cancel();

    await vi.waitFor(() => {
      expect(observedSignal?.aborted).toBe(true);
    });
  });

  it('should resolve the result promises without consuming fullStream', async () => {
    const result = streamTranslate({
      model: new MockSpeechTranslationModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'output-text-delta', id: 'item-1', delta: 'Hola' },
            {
              type: 'finish',
              sourceText: 'Hello',
              outputText: 'Hola',
              durationInSeconds: 1,
            },
          ]),
      }),
      audio,
      inputAudioFormat,
      targetLanguage,
    });

    // no fullStream access: accessing a promise consumes the stream
    expect(await result.translationText).toBe('Hola');
    expect(await result.sourceText).toBe('Hello');
    expect(await result.warnings).toEqual([]);
  });

  it('should reject the result promises without consuming fullStream when no translation is produced', async () => {
    const result = streamTranslate({
      model: new MockSpeechTranslationModelV4({
        doStream: async () =>
          createStreamResponse([{ type: 'stream-start', warnings: [] }]),
      }),
      audio,
      inputAudioFormat,
      targetLanguage,
    });

    await expect(result.translationText).rejects.toThrow(
      'No translation generated.',
    );
  });

  it('should reject fullStream access after a result promise claimed the stream', async () => {
    const result = streamTranslate({
      model: new MockSpeechTranslationModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'output-text-delta', id: 'item-1', delta: 'Hola' },
            {
              type: 'finish',
              sourceText: 'Hello',
              outputText: 'Hola',
            },
          ]),
      }),
      audio,
      inputAudioFormat,
      targetLanguage,
    });

    expect(await result.translationText).toBe('Hola');
    expect(() => result.fullStream).toThrow(
      'fullStream cannot be accessed after a result promise.',
    );
  });

  it('should support iterating fullStream before awaiting promises', async () => {
    const result = streamTranslate({
      model: new MockSpeechTranslationModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'output-text-delta', id: 'item-1', delta: 'Hola' },
            {
              type: 'finish',
              sourceText: 'Hello',
              outputText: 'Hola',
            },
          ]),
      }),
      audio,
      inputAudioFormat,
      targetLanguage,
    });

    const parts = await convertAsyncIterableToArray(result.fullStream);
    expect(parts).toEqual([
      { type: 'output-text-delta', id: 'item-1', delta: 'Hola' },
    ]);
    expect(await result.translationText).toBe('Hola');
  });

  it('should resolve a result promise while fullStream is actively consumed', async () => {
    let modelController!: ReadableStreamDefaultController<SpeechTranslationModelV4StreamPart>;
    const modelStream = new ReadableStream<SpeechTranslationModelV4StreamPart>({
      start(controller) {
        modelController = controller;
      },
    });
    const result = streamTranslate({
      model: new MockSpeechTranslationModelV4({
        doStream: async () => ({ stream: modelStream }),
      }),
      audio,
      inputAudioFormat,
      targetLanguage,
    });
    const reader = result.fullStream.getReader();

    modelController.enqueue({ type: 'stream-start', warnings: [] });
    modelController.enqueue({
      type: 'output-text-delta',
      id: 'item-1',
      delta: 'Hola',
    });
    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: { type: 'output-text-delta', id: 'item-1', delta: 'Hola' },
    });

    // Keep consuming fullStream while awaiting the result promise.
    const streamDone = reader.read();
    const translationText = result.translationText;
    modelController.enqueue({
      type: 'finish',
      sourceText: 'Hello',
      outputText: 'Hola',
    });
    modelController.close();
    expect(await translationText).toBe('Hola');
    await expect(streamDone).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  it('should reject a second fullStream access', async () => {
    const result = streamTranslate({
      model: new MockSpeechTranslationModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            {
              type: 'finish',
              sourceText: 'Hello',
              outputText: 'Hola',
            },
          ]),
      }),
      audio,
      inputAudioFormat,
      targetLanguage,
    });

    const fullStream = result.fullStream;
    const translationTextAssertion = expect(
      result.translationText,
    ).rejects.toThrow();
    expect(() => result.fullStream).toThrow(
      'fullStream can only be accessed once.',
    );
    await fullStream.cancel();
    await translationTextAssertion;
  });

  it('should succeed with an empty translationText for an audio-only stream', async () => {
    const result = streamTranslate({
      model: new MockSpeechTranslationModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            {
              type: 'audio',
              id: 'item-1',
              audio: new Uint8Array([4, 5, 6]),
            },
            { type: 'finish', sourceText: 'Hello', outputText: '' },
          ]),
      }),
      audio,
      inputAudioFormat,
      targetLanguage,
    });

    await expect(
      convertAsyncIterableToArray(result.fullStream),
    ).resolves.toEqual([
      { type: 'audio', id: 'item-1', audio: new Uint8Array([4, 5, 6]) },
    ]);
    await expect(result.translationText).resolves.toBe('');
    await expect(result.sourceText).resolves.toBe('Hello');
  });

  it('should resolve sourceText to an empty string when only output text was produced', async () => {
    const result = streamTranslate({
      model: new MockSpeechTranslationModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'output-text-delta', id: 'item-1', delta: 'Hola' },
            { type: 'finish', sourceText: '', outputText: 'Hola' },
          ]),
      }),
      audio,
      inputAudioFormat,
      targetLanguage,
    });

    await expect(
      convertAsyncIterableToArray(result.fullStream),
    ).resolves.toEqual([
      { type: 'output-text-delta', id: 'item-1', delta: 'Hola' },
    ]);
    await expect(result.sourceText).resolves.toBe('');
    await expect(result.translationText).resolves.toBe('Hola');
  });

  it('should pass error parts through on fullStream', async () => {
    const result = streamTranslate({
      model: new MockSpeechTranslationModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'error', error: new Error('provider error') },
            {
              type: 'finish',
              sourceText: 'Hello',
              outputText: 'Hola',
            },
          ]),
      }),
      audio,
      inputAudioFormat,
      targetLanguage,
    });

    await expect(
      convertAsyncIterableToArray(result.fullStream),
    ).resolves.toEqual([{ type: 'error', error: new Error('provider error') }]);
    await expect(result.translationText).resolves.toBe('Hola');
  });

  it('should error the stream when the external abort signal fires mid-stream', async () => {
    const abortController = new AbortController();
    let modelController!: ReadableStreamDefaultController<SpeechTranslationModelV4StreamPart>;

    const result = streamTranslate({
      model: new MockSpeechTranslationModelV4({
        doStream: async ({ abortSignal }) => ({
          stream: new ReadableStream<SpeechTranslationModelV4StreamPart>({
            start(controller) {
              modelController = controller;
              // providers error their stream when the signal fires:
              abortSignal?.addEventListener('abort', () => {
                controller.error(new Error('translation aborted'));
              });
            },
          }),
          response: { timestamp: testDate, modelId: 'test-model-id' },
        }),
      }),
      audio: convertArrayToReadableStream([new Uint8Array([1, 2, 3])]),
      inputAudioFormat,
      targetLanguage,
      abortSignal: abortController.signal,
    });

    const reader = result.fullStream.getReader();
    modelController.enqueue({ type: 'stream-start', warnings: [] });
    modelController.enqueue({
      type: 'output-text-delta',
      id: 'item-1',
      delta: 'Ho',
    });
    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: { type: 'output-text-delta', id: 'item-1', delta: 'Ho' },
    });

    abortController.abort();

    await expect(reader.read()).rejects.toThrow('translation aborted');
    await expect(result.translationText).rejects.toThrow('translation aborted');
  });

  it('should throw when a string model cannot be resolved', () => {
    globalThis.AI_SDK_DEFAULT_PROVIDER = {
      specificationVersion: 'v4' as const,
      languageModel: () => {
        throw new Error('not implemented');
      },
      embeddingModel: () => {
        throw new Error('not implemented');
      },
      imageModel: () => {
        throw new Error('not implemented');
      },
    };

    try {
      expect(() =>
        streamTranslate({
          model: 'test-model-id',
          audio,
          inputAudioFormat,
          targetLanguage,
        }),
      ).toThrow(
        'The default provider does not support speech translation models.',
      );
    } finally {
      delete globalThis.AI_SDK_DEFAULT_PROVIDER;
    }
  });
});
