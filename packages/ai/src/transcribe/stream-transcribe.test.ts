import {
  UnsupportedFunctionalityError,
  type TranscriptionModelV4,
  type TranscriptionModelV4StreamPart,
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
import { MockTranscriptionModelV4 } from '../test/mock-transcription-model-v4';
import { experimental_streamTranscribe } from './stream-transcribe';

vi.mock('../version', () => {
  return {
    VERSION: '0.0.0-test',
  };
});

const audio = convertArrayToReadableStream([new Uint8Array([1, 2, 3])]);
const inputAudioFormat = { type: 'audio/pcm', rate: 16000 };
const testDate = new Date(2024, 0, 1);

const createStreamResponse = (
  parts: TranscriptionModelV4StreamPart[],
): Awaited<ReturnType<NonNullable<TranscriptionModelV4['doStream']>>> => ({
  stream: convertArrayToReadableStream(parts),
  response: {
    timestamp: testDate,
    modelId: 'test-model-id',
    headers: { 'x-test': 'value' },
  },
});

describe('experimental_streamTranscribe', () => {
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
    let capturedArgs!: Parameters<
      NonNullable<TranscriptionModelV4['doStream']>
    >[0];

    const result = experimental_streamTranscribe({
      model: new MockTranscriptionModelV4({
        doStream: async args => {
          capturedArgs = args;
          return createStreamResponse([
            { type: 'stream-start', warnings: [] },
            {
              type: 'finish',
              text: 'Hello world',
              segments: [],
            },
          ]);
        },
      }),
      audio,
      inputAudioFormat,
      providerOptions: { mock: { option: 'value' } },
      headers: { 'custom-request-header': 'request-header-value' },
      abortSignal,
      includeRawChunks: true,
    });

    await convertAsyncIterableToArray(result.fullStream);

    expect(capturedArgs).toStrictEqual({
      audio,
      inputAudioFormat,
      providerOptions: { mock: { option: 'value' } },
      headers: {
        'custom-request-header': 'request-header-value',
        'user-agent': 'ai/0.0.0-test',
      },
      abortSignal,
      includeRawChunks: true,
    });
  });

  it('should stream transcript parts and resolve final metadata', async () => {
    const result = experimental_streamTranscribe({
      model: new MockTranscriptionModelV4({
        doStream: async () =>
          createStreamResponse([
            {
              type: 'stream-start',
              warnings: [{ type: 'other', message: 'test warning' }],
            },
            { type: 'transcript-delta', id: 'item-1', delta: 'Hel' },
            { type: 'transcript-delta', id: 'item-1', delta: 'lo' },
            { type: 'transcript-final', id: 'item-1', text: 'Hello' },
            {
              type: 'finish',
              text: 'Hello',
              segments: [{ text: 'Hello', startSecond: 0, endSecond: 1 }],
              language: 'en',
              durationInSeconds: 1,
              providerMetadata: { mock: { key: 'value' } },
            },
          ]),
      }),
      audio,
      inputAudioFormat,
    });

    await expect(
      convertAsyncIterableToArray(result.fullStream),
    ).resolves.toEqual([
      { type: 'transcript-delta', id: 'item-1', delta: 'Hel' },
      { type: 'transcript-delta', id: 'item-1', delta: 'lo' },
      { type: 'transcript-final', id: 'item-1', text: 'Hello' },
    ]);
    await expect(result.text).resolves.toBe('Hello');
    await expect(result.segments).resolves.toEqual([
      { text: 'Hello', startSecond: 0, endSecond: 1 },
    ]);
    await expect(result.warnings).resolves.toEqual([
      { type: 'other', message: 'test warning' },
    ]);
    await expect(result.responses).resolves.toEqual([
      {
        timestamp: testDate,
        modelId: 'test-model-id',
        headers: { 'x-test': 'value' },
      },
    ]);
    await expect(result.providerMetadata).resolves.toEqual({
      mock: { key: 'value' },
    });
    expect(logWarningsSpy).toHaveBeenCalledWith({
      warnings: [{ type: 'other', message: 'test warning' }],
      provider: 'mock-provider',
      model: 'mock-model-id',
    });
  });

  it('should throw UnsupportedFunctionalityError when doStream is unavailable', () => {
    expect(() =>
      experimental_streamTranscribe({
        model: new MockTranscriptionModelV4(),
        audio,
        inputAudioFormat,
      }),
    ).toThrow(UnsupportedFunctionalityError);
  });

  it('should reject final promises when no transcript is returned', async () => {
    const result = experimental_streamTranscribe({
      model: new MockTranscriptionModelV4({
        doStream: async () =>
          createStreamResponse([
            { type: 'stream-start', warnings: [] },
            { type: 'finish', text: '', segments: [] },
          ]),
      }),
      audio,
      inputAudioFormat,
    });

    await expect(
      convertAsyncIterableToArray(result.fullStream),
    ).rejects.toMatchObject({
      name: 'AI_NoTranscriptGeneratedError',
      message: 'No transcript generated.',
    });
    await expect(result.text).rejects.toMatchObject({
      name: 'AI_NoTranscriptGeneratedError',
      responses: [
        {
          timestamp: testDate,
          modelId: 'test-model-id',
        },
      ],
    });
  });
});
