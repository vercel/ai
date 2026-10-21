import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import type { WebSocketConstructor } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElevenLabs } from './elevenlabs-provider';
import type { ElevenLabsSpeechModel } from './elevenlabs-speech-model';
import {
  countCodePoints,
  getElevenLabsAudioFormat,
} from './elevenlabs-speech-stream';

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
      text: convertArrayToReadableStream(['Hello ', '', 'wörld 👋 ']),
      voice: 'voice-1',
      outputFormat: 'pcm_24000',
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
    expect(socket.options?.headers).toMatchObject({
      'xi-api-key': 'test-api-key',
    });

    socket.open();
    await flush();
    await flush();

    expect(socket.sentMessages()).toEqual([
      {
        text: ' ',
        voice_settings: { stability: 0.4, similarity_boost: 0.8, speed: 1.1 },
        generation_config: { chunk_length_schedule: [50, 120] },
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

  it('should default the voice and output format', async () => {
    await createModel().doStream({
      text: convertArrayToReadableStream(['Hi']),
    });

    expect(String(lastSocket().url)).toBe(
      'wss://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM/stream-input?model_id=eleven_flash_v2_5&output_format=mp3_44100_128',
    );
  });

  it('should include raw chunks when requested', async () => {
    const result = await createModel().doStream({
      text: convertArrayToReadableStream(['Hi']),
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
      text: convertArrayToReadableStream(['Hi']),
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
      text: convertArrayToReadableStream(['Hi']),
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
      text: convertArrayToReadableStream(['Hi']),
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
      text: new ReadableStream<string>({ cancel: cancelText }),
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
      text: new ReadableStream<string>(),
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

  it.each(['eleven_v3', 'eleven_v3_conversational', 'eleven_v4'])(
    'should reject %s without dialogue options, since the TTS WebSocket does not serve it',
    async modelId => {
      await expect(
        createModel(modelId).doStream({
          text: convertArrayToReadableStream(['Hi']),
        }),
      ).rejects.toThrow(UnsupportedFunctionalityError);
    },
  );
});

describe('ElevenLabsSpeechModel.doStream (multi-context)', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
  });

  it('tags every message with the context id and closes the context', async () => {
    const result = await createModel().doStream({
      text: convertArrayToReadableStream(['Hello ', 'there.']),
      voice: 'voice-1',
      providerOptions: { elevenlabs: { streaming: { contextId: 'ctx-1' } } },
    });
    const socket = lastSocket();
    expect(String(socket.url)).toBe(
      'wss://api.elevenlabs.io/v1/text-to-speech/voice-1/multi-stream-input?model_id=eleven_flash_v2_5&output_format=mp3_44100_128',
    );
    socket.open();
    await flush();
    await flush();
    expect(socket.sentMessages()).toEqual([
      { text: ' ', context_id: 'ctx-1' },
      { text: 'Hello ', context_id: 'ctx-1' },
      { text: 'there.', context_id: 'ctx-1' },
      { context_id: 'ctx-1', flush: true },
      { context_id: 'ctx-1', close_context: true },
    ]);

    socket.message({ audio: 'AQI=', contextId: 'other' });
    socket.message({ audio: 'AwQ=', contextId: 'ctx-1' });
    socket.message({ isFinal: true, contextId: 'ctx-1' });

    expect(await convertReadableStreamToArray(result.stream)).toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'audio',
        audio: 'AwQ=',
        audioFormat: { type: 'audio/mpeg', rate: 44100 },
        providerMetadata: { elevenlabs: { contextId: 'ctx-1' } },
      },
      { type: 'finish', usage: { inputCharacters: 12 } },
    ]);
    expect(socket.sentMessages().at(-1)).toEqual({ close_socket: true });
  });
});

describe('ElevenLabsSpeechModel.doStream (dialogue)', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
  });

  it('streams speaker turns from inline markers over Text-to-Dialogue (v4)', async () => {
    const result = await createModel('eleven_v4').doStream({
      text: convertArrayToReadableStream([
        '[[voice:a]]Hi there. [[vo',
        'ice:b]]Hello 👋 ',
        'friend.',
      ]),
      outputFormat: 'pcm_24000',
      providerOptions: {
        elevenlabs: {
          dialogue: { voices: ['a', 'b'], voiceSettings: { stability: 0.5 } },
          streaming: { syncAlignment: true, inactivityTimeout: 60 },
        },
      },
    });
    const socket = lastSocket();
    expect(String(socket.url)).toBe(
      'wss://api.elevenlabs.io/v1/text-to-dialogue/stream-input?model_id=eleven_v4&output_format=pcm_24000&sync_alignment=true',
    );
    socket.open();
    await flush();
    await flush();
    expect(socket.sentMessages()).toEqual([
      { voice_settings: { stability: 0.5 }, voices: ['a', 'b'] },
      { inputs: [{ text: 'Hi there. ', voice_id: 'a', new_turn: true }] },
      { inputs: [{ text: 'Hello 👋 ', voice_id: 'b', new_turn: true }] },
      { inputs: [{ text: 'friend.', voice_id: 'b' }] },
      { close_socket: true },
    ]);

    socket.message({
      audio: 'AQI=',
      alignment: {
        chars: ['H'],
        char_start_times_ms: [0],
        char_durations_ms: [5],
      },
    });
    socket.message({ is_final_audio_for_turn: true });
    socket.message({ is_final: true });

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
      // markers are not billed: 'Hi there. ' (10) + 'Hello 👋 ' (8) + 'friend.' (7)
      { type: 'finish', usage: { inputCharacters: 25 } },
    ]);
  });

  it('sends the whole script in one message for the v3 family', async () => {
    await createModel('eleven_v3_conversational').doStream({
      text: convertArrayToReadableStream(['Hello ', 'world.']),
      providerOptions: { elevenlabs: { dialogue: { voices: ['a'] } } },
    });
    const socket = lastSocket();
    socket.open();
    await flush();
    await flush();
    expect(socket.sentMessages()).toEqual([
      { voices: ['a'] },
      {
        inputs: [
          { text: 'Hello ', voice_id: 'a' },
          { text: 'world.', voice_id: 'a' },
        ],
        close_socket: true,
      },
    ]);
  });

  it('errors on server error frames', async () => {
    const result = await createModel('eleven_v4').doStream({
      text: convertArrayToReadableStream(['Hi']),
      providerOptions: { elevenlabs: { dialogue: { voices: ['a', 'b'] } } },
    });
    const socket = lastSocket();
    socket.open();
    await flush();
    socket.message({
      message: 'eleven_v3_conversational only supports a single voice.',
      error: 'invalid_argument',
      code: 1008,
    });
    await expect(convertReadableStreamToArray(result.stream)).rejects.toThrow(
      'ElevenLabs speech stream error: eleven_v3_conversational only supports a single voice.',
    );
  });

  it('rejects dialogue on non-dialogue models and with a context id', async () => {
    await expect(
      createModel('eleven_flash_v2_5').doStream({
        text: convertArrayToReadableStream(['Hi']),
        providerOptions: { elevenlabs: { dialogue: { voices: ['a'] } } },
      }),
    ).rejects.toThrow(UnsupportedFunctionalityError);
    await expect(
      createModel('eleven_v4').doStream({
        text: convertArrayToReadableStream(['Hi']),
        providerOptions: {
          elevenlabs: {
            dialogue: { voices: ['a'] },
            streaming: { contextId: 'c' },
          },
        },
      }),
    ).rejects.toThrow(
      'providerOptions.elevenlabs.dialogue cannot be combined with streaming.contextId',
    );
  });
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
