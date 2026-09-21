import {
  APICallError,
  InvalidResponseDataError,
  UnsupportedFunctionalityError,
  type Experimental_SpeechModelV4StreamPart,
} from '@ai-sdk/provider';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoSpeechGeneratedError } from '../error/no-speech-generated-error';
import * as logWarningsModule from '../logger/log-warnings';
import { MockSpeechModelV4 } from '../test/mock-speech-model-v4';
import { streamSpeech } from './stream-speech';

vi.mock('../version', () => ({ VERSION: '0.0.0-test' }));
const response = {
  timestamp: new Date('2026-09-21T00:00:00Z'),
  modelId: 'test-model',
};
const audioPart: Experimental_SpeechModelV4StreamPart = {
  type: 'audio',
  audio: new Uint8Array([1, 2]),
  mediaType: 'audio/pcm',
  providerMetadata: { google: { sampleRate: 24000 } },
};
const finishPart: Experimental_SpeechModelV4StreamPart = {
  type: 'finish',
  finishReason: { unified: 'stop', raw: 'STOP' },
  usage: { inputTokens: 12, outputTokens: 34 },
};
function createResponse(
  parts: Experimental_SpeechModelV4StreamPart[] = [audioPart],
) {
  return {
    stream: convertArrayToReadableStream([...parts, finishPart]),
    warnings: [],
    response,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('streamSpeech', () => {
  it('forwards options and exposes warnings and response metadata', async () => {
    const warnings = [{ type: 'other' as const, message: 'Warning' }];
    const logWarnings = vi
      .spyOn(logWarningsModule, 'logWarnings')
      .mockImplementation(() => {});
    const doStream = vi.fn(async () => ({ ...createResponse(), warnings }));
    const abortSignal = new AbortController().signal;
    const result = await streamSpeech({
      model: new MockSpeechModelV4({ doStream }),
      text: 'Hello',
      voice: 'Kore',
      instructions: 'Say cheerfully',
      outputFormat: 'pcm',
      language: 'en',
      speed: 1,
      providerOptions: { google: { custom: true } },
      headers: { 'x-custom': 'value' },
      abortSignal,
    });
    expect(doStream).toHaveBeenCalledWith({
      text: 'Hello',
      voice: 'Kore',
      instructions: 'Say cheerfully',
      outputFormat: 'pcm',
      language: 'en',
      speed: 1,
      providerOptions: { google: { custom: true } },
      headers: { 'x-custom': 'value', 'user-agent': 'ai/0.0.0-test' },
      abortSignal,
    });
    expect(result.warnings).toEqual(warnings);
    expect(result.responses).toEqual([response]);
    expect(logWarnings).toHaveBeenCalledWith(
      expect.objectContaining({ warnings }),
    );
    expect(await convertAsyncIterableToArray(result.fullStream)).toEqual([
      audioPart,
      finishPart,
    ]);
  });

  it('decodes base64, skips empty chunks, and streams bytes in order', async () => {
    const result = await streamSpeech({
      model: new MockSpeechModelV4({
        doStream: async () =>
          createResponse([
            { ...audioPart, audio: '' },
            audioPart,
            { ...audioPart, audio: 'AwQ=' },
          ]),
      }),
      text: 'Hello',
    });
    expect(await convertAsyncIterableToArray(result.audioStream)).toEqual([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
    ]);
  });

  it('rejects providers without a streaming implementation', async () => {
    await expect(
      streamSpeech({ model: new MockSpeechModelV4(), text: 'Hello' }),
    ).rejects.toBeInstanceOf(UnsupportedFunctionalityError);
  });

  it('rejects streams that produce no audio', async () => {
    const result = await streamSpeech({
      model: new MockSpeechModelV4({
        doStream: async () => createResponse([]),
      }),
      text: 'Hello',
    });
    await expect(
      convertAsyncIterableToArray(result.audioStream),
    ).rejects.toBeInstanceOf(NoSpeechGeneratedError);
  });

  it('exposes incomplete completion and usage in fullStream', async () => {
    const finish = {
      ...finishPart,
      finishReason: { unified: 'length' as const, raw: 'MAX_TOKENS' },
    };
    const result = await streamSpeech({
      model: new MockSpeechModelV4({
        doStream: async () => ({
          ...createResponse(),
          stream: convertArrayToReadableStream([audioPart, finish]),
        }),
      }),
      text: 'Hello',
    });
    expect(await convertAsyncIterableToArray(result.fullStream)).toEqual([
      audioPart,
      finish,
    ]);
  });

  it('rejects incomplete generation in audioStream', async () => {
    const result = await streamSpeech({
      model: new MockSpeechModelV4({
        doStream: async () => ({
          ...createResponse(),
          stream: convertArrayToReadableStream([
            audioPart,
            {
              ...finishPart,
              finishReason: { unified: 'length', raw: 'MAX_TOKENS' },
            },
          ]),
        }),
      }),
      text: 'Hello',
    });
    await expect(
      convertAsyncIterableToArray(result.audioStream),
    ).rejects.toThrow('MAX_TOKENS');
  });

  it('rejects a stream that ends without a finish event', async () => {
    const result = await streamSpeech({
      model: new MockSpeechModelV4({
        doStream: async () => ({
          ...createResponse(),
          stream: convertArrayToReadableStream([audioPart]),
        }),
      }),
      text: 'Hello',
    });
    await expect(
      convertAsyncIterableToArray(result.fullStream),
    ).rejects.toBeInstanceOf(InvalidResponseDataError);
  });

  it('retries failures while opening the request', async () => {
    vi.useFakeTimers();
    const doStream = vi
      .fn()
      .mockRejectedValueOnce(
        new APICallError({
          message: 'Unavailable',
          url: 'https://example.com',
          requestBodyValues: {},
          statusCode: 500,
        }),
      )
      .mockResolvedValue(createResponse());
    const pending = streamSpeech({
      model: new MockSpeechModelV4({ doStream }),
      text: 'Hello',
    });
    await vi.runAllTimersAsync();
    const result = await pending;
    expect(doStream).toHaveBeenCalledTimes(2);
    expect(await convertAsyncIterableToArray(result.audioStream)).toEqual([
      audioPart.audio,
    ]);
  });

  it('propagates midstream failures without retrying or replacing the error', async () => {
    const error = new APICallError({
      message: 'Connection lost',
      url: 'https://example.com',
      requestBodyValues: {},
      isRetryable: true,
    });
    let source!: ReadableStreamDefaultController<Experimental_SpeechModelV4StreamPart>;
    const doStream = vi.fn(async () => ({
      ...createResponse(),
      stream: new ReadableStream<Experimental_SpeechModelV4StreamPart>({
        start(controller) {
          source = controller;
        },
      }),
    }));
    const result = await streamSpeech({
      model: new MockSpeechModelV4({ doStream }),
      text: 'Hello',
    });
    const reader = result.audioStream.getReader();
    source.enqueue(audioPart);
    expect((await reader.read()).value).toEqual(audioPart.audio);
    source.error(error);
    await expect(reader.read()).rejects.toBe(error);
    expect(doStream).toHaveBeenCalledTimes(1);
  });

  it.each(['audioStream', 'fullStream'] as const)(
    'cancels the provider on early exit from %s',
    async property => {
      const cancel = vi.fn();
      const result = await streamSpeech({
        model: new MockSpeechModelV4({
          doStream: async () => ({
            ...createResponse(),
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue(audioPart);
              },
              cancel,
            }),
          }),
        }),
        text: 'Hello',
      });
      for await (const _part of result[property]) {
        break;
      }
      await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
    },
  );

  it('does not buffer a second unread stream for replay', async () => {
    const result = await streamSpeech({
      model: new MockSpeechModelV4({ doStream: async () => createResponse() }),
      text: 'Hello',
    });
    const stream = result.audioStream;
    expect(() => result.fullStream).toThrow('Choose either');
    expect(() => result.audioStream).toThrow('Choose either');
    await convertAsyncIterableToArray(stream);
  });

  it('cancels a response before any audio arrives', async () => {
    const cancel = vi.fn();
    const result = await streamSpeech({
      model: new MockSpeechModelV4({
        doStream: async () => ({
          ...createResponse(),
          stream: new ReadableStream({ cancel }),
        }),
      }),
      text: 'Hello',
    });
    await result.audioStream.cancel();
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
  });
});
