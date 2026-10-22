import {
  type Experimental_SpeechModelV4StreamTextPart as SpeechModelV4StreamTextPart,
  InvalidArgumentError,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import type { WebSocketConstructor } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElevenLabs } from './elevenlabs-provider';
import {
  type ElevenLabsSpeechModel,
  toElevenLabsStreamOutputFormat,
} from './elevenlabs-speech-model';
import {
  countCodePoints,
  getElevenLabsAudioFormat,
} from './elevenlabs-speech-stream';

function textParts(texts: string[]) {
  return convertArrayToReadableStream<SpeechModelV4StreamTextPart>(
    texts.map(text => ({ type: 'text', text })),
  );
}

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readyState = 0;
  bufferedAmount = 0;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
  });
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;

  constructor(
    public url: string | URL,
    public protocols?: string | string[],
    public options?: { headers?: Record<string, string | undefined> },
  ) {
    MockWebSocket.instances.push(this);
  }

  open() {
    this.readyState = 1;
    this.onopen?.({});
  }

  message(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }

  remoteClose(code?: number, reason?: string) {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  error() {
    this.onerror?.({});
  }

  sentMessages() {
    return this.send.mock.calls.map(([data]) => JSON.parse(String(data)));
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function createModel(modelId = 'eleven_flash_v2_5') {
  return createElevenLabs({
    apiKey: 'test-api-key',
    webSocket: MockWebSocket as unknown as WebSocketConstructor,
  }).speech(modelId) as ElevenLabsSpeechModel;
}

function lastSocket(): MockWebSocket {
  const socket = MockWebSocket.instances.at(-1);
  if (socket == null) {
    throw new Error('no socket');
  }
  return socket;
}

describe('ElevenLabsSpeechModel.doStream', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
  });

  it('should stream text deltas and audio over the stream-input WebSocket', async () => {
    const result = await createModel().doStream({
      text: textParts(['Hello ', '', 'wörld 👋 ']),
      voice: 'voice-1',
      outputFormat: { type: 'audio/pcm', rate: 24000 },
      speed: 1.1,
      language: 'en',
      providerOptions: {
        elevenlabs: {
          voiceSettings: { stability: 0.4, similarityBoost: 0.8 },
          seed: 7,
          applyTextNormalization: 'off',
          streaming: {
            autoMode: true,
            chunkLengthSchedule: [50, 120],
            inactivityTimeout: 60,
            syncAlignment: true,
          },
        },
      },
    });

    const socket = lastSocket();
    expect(String(socket.url)).toBe(
      'wss://api.elevenlabs.io/v1/text-to-speech/voice-1/stream-input?model_id=eleven_flash_v2_5&output_format=pcm_24000&language_code=en&inactivity_timeout=60&sync_alignment=true&auto_mode=true&apply_text_normalization=off&seed=7',
    );
    // Authenticated in the init message, so native WebSockets work too.
    expect(socket.options?.headers).not.toHaveProperty('xi-api-key');
    expect(JSON.stringify(result.request)).not.toContain('test-api-key');

    socket.open();
    await flush();
    await flush();

    expect(socket.sentMessages()).toEqual([
      {
        text: ' ',
        voice_settings: { stability: 0.4, similarity_boost: 0.8, speed: 1.1 },
        generation_config: { chunk_length_schedule: [50, 120] },
        'xi-api-key': 'test-api-key',
      },
      { text: 'Hello ' },
      { text: 'wörld 👋 ' },
      { text: '' },
    ]);

    socket.message({
      audio: 'AQI=',
      alignment: { chars: ['H'], charStartTimesMs: [0], charDurationsMs: [5] },
    });
    socket.message({ audio: 'AwQ=' });
    socket.message({ audio: null, isFinal: true });

    expect(await convertReadableStreamToArray(result.stream)).toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'audio',
        audio: 'AQI=',
        audioFormat: { type: 'audio/pcm', rate: 24000 },
        providerMetadata: {
          elevenlabs: {
            alignment: {
              chars: ['H'],
              charStartTimesMs: [0],
              charDurationsMs: [5],
            },
          },
        },
      },
      {
        type: 'audio',
        audio: 'AwQ=',
        audioFormat: { type: 'audio/pcm', rate: 24000 },
      },
      // 'Hello ' (6) + 'wörld 👋 ' (8 code points, 9 UTF-16 units)
      { type: 'finish', usage: { inputCharacters: 14 } },
    ]);
    expect(socket.close).toHaveBeenCalledWith(1000);
  });

  it('should hold partial words until a word boundary and flush the rest at the end', async () => {
    const result = await createModel().doStream({
      text: textParts(['Hel', 'lo wor', 'ld, how a', 're', ' you']),
    });
    const socket = lastSocket();
    socket.open();
    await flush();
    await flush();

    expect(socket.sentMessages().slice(1)).toEqual([
      { text: 'Hello ' },
      { text: 'world, how ' },
      { text: 'are ' },
      { text: 'you' },
      { text: '' },
    ]);

    socket.message({ audio: 'AQI=' });
    socket.message({ isFinal: true });
    const parts = await convertReadableStreamToArray(result.stream);
    expect(parts.at(-1)).toEqual({
      type: 'finish',
      usage: { inputCharacters: 24 },
    });
  });

  it('should not hold text without spaces indefinitely', async () => {
    await createModel().doStream({
      text: textParts(['こんにちは', '世界。次', 'x'.repeat(100)]),
    });
    const socket = lastSocket();
    socket.open();
    await flush();
    await flush();

    expect(socket.sentMessages().slice(1)).toEqual([
      { text: 'こんにちは世界。' },
      { text: `次${'x'.repeat(100)}` },
      { text: '' },
    ]);
  });

  it('should send keepalives while the text stream is idle, and none after the input ends', async () => {
    vi.useFakeTimers();
    try {
      let releaseText: (() => void) | undefined;
      const text = new ReadableStream<SpeechModelV4StreamTextPart>({
        async pull(controller) {
          controller.enqueue({ type: 'text', text: 'Thinking... ' });
          await new Promise<void>(resolve => {
            releaseText = resolve;
          });
          controller.close();
        },
      });
      await createModel().doStream({ text });
      const socket = lastSocket();
      socket.open();
      await vi.advanceTimersByTimeAsync(0);
      expect(socket.sentMessages().slice(1)).toEqual([
        { text: 'Thinking... ' },
      ]);

      await vi.advanceTimersByTimeAsync(15_000);
      expect(socket.sentMessages().slice(1)).toEqual([
        { text: 'Thinking... ' },
        { text: ' ' },
      ]);

      releaseText?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(socket.sentMessages().at(-1)).toEqual({ text: '' });
      const sentAtEnd = socket.sentMessages().length;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(socket.sentMessages().length).toBe(sentAtEnd);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should not send keepalives when inactivityTimeout is set explicitly', async () => {
    vi.useFakeTimers();
    try {
      const text = new ReadableStream<SpeechModelV4StreamTextPart>({
        async pull(controller) {
          controller.enqueue({ type: 'text', text: 'Thinking... ' });
          await new Promise<void>(() => {});
        },
      });
      await createModel().doStream({
        text,
        providerOptions: {
          elevenlabs: { streaming: { inactivityTimeout: 20 } },
        },
      });
      const socket = lastSocket();
      socket.open();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(socket.sentMessages().slice(1)).toEqual([
        { text: 'Thinking... ' },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should error when a text part requests a different voice', async () => {
    const result = await createModel().doStream({
      voice: 'voice-1',
      text: convertArrayToReadableStream<SpeechModelV4StreamTextPart>([
        { type: 'text', text: 'Hello ', voice: 'voice-1' },
        { type: 'text', text: 'there ', voice: 'voice-2' },
      ]),
    });
    lastSocket().open();
    await expect(convertReadableStreamToArray(result.stream)).rejects.toThrow(
      InvalidArgumentError,
    );
  });

  it('should default the voice and output format', async () => {
    await createModel().doStream({
      text: textParts(['Hi']),
    });

    expect(String(lastSocket().url)).toBe(
      'wss://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM/stream-input?model_id=eleven_flash_v2_5&output_format=mp3_44100_128',
    );
  });

  it('should include raw chunks when requested', async () => {
    const result = await createModel().doStream({
      text: textParts(['Hi']),
      includeRawChunks: true,
    });
    const socket = lastSocket();
    socket.open();
    await flush();
    socket.message({ audio: 'AQI=' });
    socket.message({ isFinal: true });

    const parts = await convertReadableStreamToArray(result.stream);
    expect(parts.filter(part => part.type === 'raw')).toEqual([
      { type: 'raw', rawValue: { audio: 'AQI=' } },
      { type: 'raw', rawValue: { isFinal: true } },
    ]);
  });

  it('should warn about unsupported options', async () => {
    const result = await createModel().doStream({
      text: textParts(['Hi']),
      instructions: 'whisper',
      providerOptions: { elevenlabs: { previousText: 'Before.' } },
    });
    const socket = lastSocket();
    socket.open();
    const reader = result.stream.getReader();

    expect((await reader.read()).value).toEqual({
      type: 'stream-start',
      warnings: [
        {
          type: 'unsupported',
          feature: 'instructions',
          details:
            'ElevenLabs speech models do not support instructions. Instructions parameter was ignored.',
        },
        {
          type: 'unsupported',
          feature: 'providerOptions.elevenlabs.previousText',
          details: 'ElevenLabs streaming speech does not support previousText.',
        },
      ],
    });
    await reader.cancel();
  });

  it('should error on a server error message', async () => {
    const result = await createModel().doStream({
      text: textParts(['Hi']),
    });
    const socket = lastSocket();
    socket.open();
    await flush();
    socket.message({ message: 'Invalid API key', error: 'auth_error' });

    await expect(convertReadableStreamToArray(result.stream)).rejects.toThrow(
      'ElevenLabs speech stream error: Invalid API key',
    );
  });

  it('should error when the socket closes before isFinal', async () => {
    const result = await createModel().doStream({
      text: textParts(['Hi']),
    });
    const socket = lastSocket();
    socket.open();
    await flush();
    socket.remoteClose(1008, 'Have not received new text');

    await expect(convertReadableStreamToArray(result.stream)).rejects.toThrow(
      'ElevenLabs speech stream closed before completion (code 1008: Have not received new text).',
    );
  });

  it('should close the socket and cancel the text when the stream is cancelled', async () => {
    const cancelText = vi.fn();
    const result = await createModel().doStream({
      text: new ReadableStream<SpeechModelV4StreamTextPart>({
        cancel: cancelText,
      }),
    });
    const socket = lastSocket();
    socket.open();
    await flush();

    await result.stream.cancel();

    expect(socket.close).toHaveBeenCalled();
    await vi.waitFor(() => expect(cancelText).toHaveBeenCalled());
  });

  it('should close the socket on abort', async () => {
    const abortController = new AbortController();
    const result = await createModel().doStream({
      text: new ReadableStream<SpeechModelV4StreamTextPart>(),
      abortSignal: abortController.signal,
    });
    const socket = lastSocket();
    socket.open();
    abortController.abort(new Error('stop'));

    await expect(convertReadableStreamToArray(result.stream)).rejects.toThrow(
      'stop',
    );
    expect(socket.close).toHaveBeenCalled();
  });

  it('should send versioned pronunciation dictionary locators', async () => {
    await createModel().doStream({
      text: textParts(['Hi']),
      providerOptions: {
        elevenlabs: {
          pronunciationDictionaryLocators: [
            { pronunciationDictionaryId: 'dict', versionId: 'v1' },
          ],
        },
      },
    });
    const socket = lastSocket();
    socket.open();
    await flush();

    expect(socket.sentMessages()[0].pronunciation_dictionary_locators).toEqual([
      { pronunciation_dictionary_id: 'dict', version_id: 'v1' },
    ]);
  });

  it('should reject unversioned pronunciation dictionary locators before connecting', async () => {
    const cancel = vi.fn();
    const socketsBefore = MockWebSocket.instances.length;

    await expect(
      createModel().doStream({
        text: new ReadableStream<SpeechModelV4StreamTextPart>({ cancel }),
        providerOptions: {
          elevenlabs: {
            pronunciationDictionaryLocators: [
              { pronunciationDictionaryId: 'dict' },
            ],
          },
        },
      }),
    ).rejects.toThrow(InvalidArgumentError);
    expect(MockWebSocket.instances.length).toBe(socketsBefore);
    expect(cancel).toHaveBeenCalled();
  });

  it.each(['eleven_v3', 'eleven_v3_conversational', 'eleven_v4'])(
    'should reject %s, which the stream-input WebSocket does not serve',
    async modelId => {
      await expect(
        createModel(modelId).doStream({
          text: textParts(['Hi']),
        }),
      ).rejects.toThrow(UnsupportedFunctionalityError);
    },
  );
});

describe('countCodePoints', () => {
  it('should count astral characters once', () => {
    expect(countCodePoints('a👋é')).toBe(3);
    expect('a👋é'.length).toBe(4);
  });
});

describe('getElevenLabsAudioFormat', () => {
  it.each([
    ['mp3_44100_128', { type: 'audio/mpeg', rate: 44100 }],
    ['pcm_16000', { type: 'audio/pcm', rate: 16000 }],
    ['ulaw_8000', { type: 'audio/pcmu', rate: 8000 }],
    ['alaw_8000', { type: 'audio/pcma', rate: 8000 }],
    ['opus_48000_64', { type: 'audio/opus', rate: 48000 }],
    ['unknown', { type: 'application/octet-stream' }],
  ])('should map %s', (outputFormat, expected) => {
    expect(getElevenLabsAudioFormat(outputFormat)).toEqual(expected);
  });
});

describe('toElevenLabsStreamOutputFormat', () => {
  it.each([
    [undefined, 'mp3_44100_128'],
    [{ type: 'audio/mpeg' }, 'mp3_44100_128'],
    [{ type: 'audio/mpeg', rate: 22050 }, 'mp3_22050_32'],
    [{ type: 'audio/pcm' }, 'pcm_24000'],
    [{ type: 'audio/pcm', rate: 16000 }, 'pcm_16000'],
    [{ type: 'audio/pcmu' }, 'ulaw_8000'],
    [{ type: 'audio/pcma', rate: 8000 }, 'alaw_8000'],
    [{ type: 'audio/opus' }, 'opus_48000_64'],
  ])('should map %j to %s', (format, expected) => {
    expect(toElevenLabsStreamOutputFormat(format)).toBe(expected);
  });

  it.each([
    { type: 'audio/pcm', rate: 11025 },
    { type: 'audio/wav' },
    { type: 'audio/mpeg', rate: 48000 },
  ])('should reject %j', format => {
    expect(() => toElevenLabsStreamOutputFormat(format)).toThrow(
      InvalidArgumentError,
    );
  });
});
