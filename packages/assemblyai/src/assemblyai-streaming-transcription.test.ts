import type { Experimental_TranscriptionModelV4StreamPart as TranscriptionModelV4StreamPart } from '@ai-sdk/provider';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAssemblyAI } from './assemblyai-provider';

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
  serverClose(code = 1000, reason?: string) {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
  sentText() {
    return this.send.mock.calls
      .map(([value]) => value)
      .filter((value): value is string => typeof value === 'string');
  }
  sentAudio() {
    return this.send.mock.calls
      .map(([value]) => value)
      .filter((value): value is Uint8Array => value instanceof Uint8Array);
  }
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
};

const tokenFetch = vi.fn(
  async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify({ token: 'temporary-token' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
);

const provider = () =>
  createAssemblyAI({
    apiKey: 'test-api-key',
    fetch: tokenFetch,
    webSocket: MockWebSocket,
  });

const audio = () =>
  convertArrayToReadableStream<Uint8Array | string>([
    new Uint8Array([1, 2]),
    'AwQ=',
    new Uint8Array(),
  ]);
const inputAudioFormat = { type: 'audio/pcm', rate: 16000 };

const begin = {
  type: 'Begin',
  id: 'session-1',
  expires_at: 1,
  configuration: { model: 'assemblyai-stt-3-7-realtime-agent' },
};
const turn = (
  turnOrder: number,
  transcript: string,
  endOfTurn: boolean,
  extra: Record<string, unknown> = {},
) => ({
  type: 'Turn',
  turn_order: turnOrder,
  turn_is_formatted: true,
  end_of_turn: endOfTurn,
  transcript,
  end_of_turn_confidence: endOfTurn ? 1 : 0,
  words:
    transcript.length > 0
      ? [
          { text: transcript, start: 1000, end: 1500, confidence: 0.9 },
          { text: 'x', start: 1600, end: 2250, confidence: 0.8 },
        ]
      : [],
  ...extra,
});
const termination = {
  type: 'Termination',
  audio_duration_seconds: 3,
  session_duration_seconds: 4,
};

async function startStream(
  options: {
    modelId?: string;
    providerOptions?: Record<string, Record<string, unknown>>;
    includeRawChunks?: boolean;
    audio?: ReadableStream<Uint8Array | string>;
  } = {},
) {
  const result = await provider().transcription(
    options.modelId ?? 'assemblyai-stt-3-7-realtime-agent',
  ).doStream!({
    audio: options.audio ?? audio(),
    inputAudioFormat,
    providerOptions: options.providerOptions as never,
    includeRawChunks: options.includeRawChunks,
  });
  const socket = MockWebSocket.instances.at(-1)!;
  return { result, socket };
}

/** Opens the session, streams the audio, and returns the socket. */
async function runSession(
  options: Parameters<typeof startStream>[0],
  messages: unknown[],
) {
  const { result, socket } = await startStream(options);
  socket.open();
  socket.message(begin);
  await flush();
  for (const message of messages) socket.message(message);
  await flush();
  return { result, socket };
}

describe('AssemblyAI streaming transcription', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    tokenFetch.mockClear();
  });

  describe('connection', () => {
    it('exchanges the API key for a temporary token', async () => {
      await startStream();

      expect(tokenFetch).toHaveBeenCalledTimes(1);
      const [url, init] = tokenFetch.mock.calls[0];
      expect(url).toBe('https://token.assemblyai.com/v1/token');
      expect(new Headers(init?.headers).get('authorization')).toBe(
        'test-api-key',
      );
      expect(JSON.parse(init?.body as string)).toEqual({
        product: 'streaming',
        expires_in_seconds: 60,
      });
    });

    it('connects with the session parameters and the token in the URL', async () => {
      const { result, socket } = await startStream({
        providerOptions: {
          assemblyai: {
            prompt: 'A customer support call.',
            keytermsPrompt: ['AI SDK', 'AssemblyAI'],
            redactPii: true,
            redactPiiPolicies: ['person_name'],
            streaming: {
              mode: 'min_latency',
              minTurnSilence: 200,
              maxTurnSilence: 1500,
              interruptionDelay: 0,
              agentContext: 'How can I help?',
              languageCodes: ['en', 'es'],
              voiceFocus: 'near-field',
              voiceFocusThreshold: 0.6,
            },
          },
        },
      });

      const url = new URL(socket.url);
      expect(`${url.origin}${url.pathname}`).toBe(
        'wss://streaming.assemblyai.com/v3/ws',
      );
      expect(Object.fromEntries(url.searchParams)).toEqual({
        speech_model: 'assemblyai-stt-3-7-realtime-agent',
        encoding: 'pcm_s16le',
        sample_rate: '16000',
        prompt: 'A customer support call.',
        keyterms_prompt: '["AI SDK","AssemblyAI"]',
        redact_pii: 'true',
        redact_pii_policies: '["person_name"]',
        mode: 'min_latency',
        min_turn_silence: '200',
        max_turn_silence: '1500',
        interruption_delay: '0',
        agent_context: 'How can I help?',
        language_codes: '["en","es"]',
        voice_focus: 'near-field',
        voice_focus_threshold: '0.6',
        token: 'temporary-token',
      });
      expect(result.request?.body).not.toContain('token');
      expect(socket.options?.headers).toEqual({});
    });

    it('maps languageCode to a single-element language_codes list', async () => {
      const { socket } = await startStream({
        providerOptions: { assemblyai: { languageCode: 'es' } },
      });

      expect(new URL(socket.url).searchParams.get('language_codes')).toBe(
        '["es"]',
      );
    });

    it('maps compressed formats without a sample rate', async () => {
      await provider().transcription('universal-3-6-pro').doStream!({
        audio: audio(),
        inputAudioFormat: { type: 'audio/ogg' },
      });

      const url = new URL(MockWebSocket.instances[0].url);
      expect(url.searchParams.get('encoding')).toBe('ogg_opus');
      expect(url.searchParams.has('sample_rate')).toBe(false);
    });

    it('reports token API failures', async () => {
      tokenFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Invalid API key' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
      );

      await expect(startStream()).rejects.toThrow('Invalid API key');
      expect(MockWebSocket.instances).toHaveLength(0);
    });
  });

  describe('validation', () => {
    it('rejects pre-recorded models', async () => {
      await expect(
        startStream({ modelId: 'assemblyai-stt-3-7' }),
      ).rejects.toThrow(
        "'assemblyai-stt-3-7' is a pre-recorded model and does not support streaming transcription.",
      );
      expect(tokenFetch).not.toHaveBeenCalled();
    });

    it('streams the deprecated universal-3-5-pro with a warning', async () => {
      const { result, socket } = await startStream({
        modelId: 'universal-3-5-pro',
      });
      socket.open();
      const reader = result.stream.getReader();
      const { value } = await reader.read();
      reader.releaseLock();

      expect(value).toMatchObject({
        type: 'stream-start',
        warnings: [
          {
            type: 'deprecated',
            setting: "model 'universal-3-5-pro'",
            message: expect.stringContaining(
              "Use 'assemblyai-stt-3-7-realtime-agent' instead.",
            ),
          },
        ],
      });
    });

    it('passes unknown model IDs through', async () => {
      const { socket } = await startStream({ modelId: 'future-model' });

      expect(new URL(socket.url).searchParams.get('speech_model')).toBe(
        'future-model',
      );
    });

    it.each([
      [{ type: 'audio/wav', rate: 16000 }],
      [{ type: 'audio/pcm' }],
      [{ type: 'audio/pcm', rate: 4000 }],
    ])('rejects the input audio format %o', async format => {
      await expect(
        provider().transcription('universal-3-6-pro').doStream!({
          audio: audio(),
          inputAudioFormat: format,
        }),
      ).rejects.toThrow('AssemblyAI streaming transcription');
    });

    it('rejects voiceFocusThreshold without voiceFocus', async () => {
      await expect(
        startStream({
          providerOptions: {
            assemblyai: { streaming: { voiceFocusThreshold: 0.5 } },
          },
        }),
      ).rejects.toThrow("'streaming.voiceFocusThreshold' requires");
    });

    it('rejects PII redaction settings without redactPii', async () => {
      await expect(
        startStream({
          providerOptions: { assemblyai: { redactPiiSub: 'entity_name' } },
        }),
      ).rejects.toThrow("require 'redactPii'");
    });

    it('rejects manual mode, which needs ForceEndpoint messages', async () => {
      await expect(
        startStream({
          providerOptions: { assemblyai: { streaming: { mode: 'manual' } } },
        }),
      ).rejects.toThrow();
    });
  });

  describe('warnings', () => {
    it('lists ignored options', async () => {
      const { result, socket } = await startStream({
        providerOptions: {
          assemblyai: {
            autoChapters: true,
            punctuate: false,
            languageCode: 'en',
            streaming: { languageCodes: ['es'], maxSpeakers: 2 },
          },
        },
      });
      socket.open();
      const reader = result.stream.getReader();
      const { value } = await reader.read();
      reader.releaseLock();

      expect(value).toMatchInlineSnapshot(`
        {
          "type": "stream-start",
          "warnings": [
            {
              "details": "This option only applies to pre-recorded transcription and is ignored for streaming transcription.",
              "feature": "providerOptions.assemblyai.autoChapters",
              "type": "unsupported",
            },
            {
              "details": "This option only applies to pre-recorded transcription and is ignored for streaming transcription.",
              "feature": "providerOptions.assemblyai.punctuate",
              "type": "unsupported",
            },
            {
              "message": "'languageCode' is ignored because 'streaming.languageCodes' is set.",
              "type": "other",
            },
            {
              "message": "'streaming.maxSpeakers' only applies when 'speakerLabels' is enabled.",
              "type": "other",
            },
          ],
        }
      `);
    });
  });

  describe('session', () => {
    it('sends audio after Begin and Terminate when the audio ends', async () => {
      const { socket } = await startStream();
      socket.open();
      await flush();
      expect(socket.send).not.toHaveBeenCalled();

      socket.message(begin);
      await flush();

      // Chunks under 20 ms are merged and padded with silence to 20 ms.
      const padded = new Uint8Array(640);
      padded.set([1, 2, 3, 4]);
      expect(socket.sentAudio()).toEqual([padded]);
      expect(socket.sentText()).toEqual(['{"type":"Terminate"}']);
    });

    it('keeps raw audio messages within 20-1000 ms', async () => {
      const ms = (duration: number, fill = 1) =>
        new Uint8Array(duration * 32).fill(fill); // 16 kHz, 2 bytes per sample
      const { socket } = await startStream({
        audio: convertArrayToReadableStream([
          ms(50), // in range: sent unchanged
          ms(10, 2), // too short: held back
          ms(15, 3), // merged with the held-back audio (25 ms)
          ms(1250, 4), // too long: split
          ms(5, 5), // final remainder: padded to 20 ms
        ]),
      });
      socket.open();
      socket.message(begin);
      await flush();

      expect(socket.sentAudio().map(chunk => chunk.length / 32)).toEqual([
        50, 25, 100, 100, 100, 950, 20,
      ]);
      expect(socket.sentAudio()[1].slice(318, 322)).toEqual(
        new Uint8Array([2, 2, 3, 3]),
      );
      expect(socket.sentAudio()[6].slice(158, 162)).toEqual(
        new Uint8Array([5, 5, 0, 0]),
      );
    });

    it('pads mu-law audio with mu-law silence', async () => {
      await provider().transcription('universal-3-6-pro').doStream!({
        audio: convertArrayToReadableStream([new Uint8Array([7])]),
        inputAudioFormat: { type: 'audio/pcmu', rate: 8000 },
      });
      const socket = MockWebSocket.instances[0];
      socket.open();
      socket.message(begin);
      await flush();

      const expected = new Uint8Array(160).fill(0xff);
      expected[0] = 7;
      expect(socket.sentAudio()).toEqual([expected]);
    });

    it('sends compressed audio unchanged', async () => {
      await provider().transcription('universal-3-6-pro').doStream!({
        audio: convertArrayToReadableStream([new Uint8Array([9])]),
        inputAudioFormat: { type: 'audio/opus' },
      });
      const socket = MockWebSocket.instances[0];
      socket.open();
      socket.message(begin);
      await flush();

      expect(socket.sentAudio()).toEqual([new Uint8Array([9])]);
    });

    it('maps turns and finishes on Termination', async () => {
      const { result } = await runSession({}, [
        turn(0, 'Hello', false),
        turn(0, 'Hello world.', true, {
          language_code: 'en',
          language_confidence: 0.98,
          speaker_label: 'A',
        }),
        turn(1, '', true),
        termination,
      ]);

      const parts = await convertReadableStreamToArray(result.stream);
      expect(parts[1]).toMatchObject({ timestamp: expect.any(Date) });
      expect(
        parts.map(part =>
          part.type === 'response-metadata'
            ? { ...part, timestamp: '<date>' }
            : part,
        ),
      ).toMatchInlineSnapshot(`
        [
          {
            "type": "stream-start",
            "warnings": [],
          },
          {
            "body": {
              "configuration": {
                "model": "assemblyai-stt-3-7-realtime-agent",
              },
              "expires_at": 1,
              "id": "session-1",
              "type": "Begin",
            },
            "modelId": "assemblyai-stt-3-7-realtime-agent",
            "timestamp": "<date>",
            "type": "response-metadata",
          },
          {
            "durationInSeconds": 1.25,
            "id": "turn-0",
            "startSecond": 1,
            "text": "Hello",
            "type": "transcript-partial",
          },
          {
            "endSecond": 2.25,
            "id": "turn-0",
            "providerMetadata": {
              "assemblyai": {
                "endOfTurnConfidence": 1,
                "languageCode": "en",
                "languageConfidence": 0.98,
                "speakerLabel": "A",
                "turnOrder": 0,
                "words": [
                  {
                    "confidence": 0.9,
                    "end": 1500,
                    "start": 1000,
                    "text": "Hello world.",
                  },
                  {
                    "confidence": 0.8,
                    "end": 2250,
                    "start": 1600,
                    "text": "x",
                  },
                ],
              },
            },
            "startSecond": 1,
            "text": "Hello world.",
            "type": "transcript-final",
          },
          {
            "durationInSeconds": 3,
            "language": "en",
            "providerMetadata": {
              "assemblyai": {
                "sessionId": "session-1",
              },
            },
            "segments": [
              {
                "endSecond": 1.5,
                "startSecond": 1,
                "text": "Hello world.",
              },
              {
                "endSecond": 2.25,
                "startSecond": 1.6,
                "text": "x",
              },
            ],
            "text": "Hello world.",
            "type": "finish",
            "usage": {
              "sessionDurationSeconds": 4,
            },
          },
        ]
      `);
    });

    it('closes a turn with an empty final after a partial', async () => {
      const { result } = await runSession({}, [
        turn(0, 'Um', false),
        turn(0, '', true),
        turn(1, 'Next.', true),
        termination,
      ]);

      const parts = await convertReadableStreamToArray(result.stream);
      expect(
        parts
          .filter(part => part.type === 'transcript-final')
          .map(part => (part as { text: string }).text),
      ).toEqual(['', 'Next.']);
      expect(parts.at(-1)).toMatchObject({ type: 'finish', text: 'Next.' });
    });

    it('replaces a re-sent final turn in the finished text', async () => {
      const { result } = await runSession({}, [
        turn(0, 'First draft.', true),
        turn(0, 'First final.', true),
        turn(1, 'Second.', true),
        termination,
      ]);

      const parts = await convertReadableStreamToArray(result.stream);
      expect(parts.at(-1)).toMatchObject({
        type: 'finish',
        text: 'First final. Second.',
      });
    });

    it('uses a single steered language code as the language', async () => {
      const { result } = await runSession(
        {
          providerOptions: {
            assemblyai: {
              languageCode: 'en',
              streaming: { languageCodes: ['es'] },
            },
          },
        },
        [turn(0, 'Hola.', true), termination],
      );

      const parts = await convertReadableStreamToArray(result.stream);
      expect(parts.at(-1)).toMatchObject({ type: 'finish', language: 'es' });
    });

    it('treats empty languageCodes as unset', async () => {
      const { socket } = await startStream({
        providerOptions: {
          assemblyai: { languageCode: 'es', streaming: { languageCodes: [] } },
        },
      });

      expect(new URL(socket.url).searchParams.get('language_codes')).toBe(
        '["es"]',
      );
    });

    it('uses the requested language when language detection is off', async () => {
      const { result } = await runSession(
        { providerOptions: { assemblyai: { languageCode: 'es' } } },
        [turn(0, 'Hola.', true), termination],
      );

      const parts = await convertReadableStreamToArray(result.stream);
      expect(parts.at(-1)).toMatchObject({ type: 'finish', language: 'es' });
    });

    it('includes raw chunks when requested', async () => {
      const speechStarted = { type: 'SpeechStarted', timestamp: 960 };
      const { result } = await runSession({ includeRawChunks: true }, [
        speechStarted,
        termination,
      ]);

      const parts = await convertReadableStreamToArray(result.stream);
      expect(parts.filter(part => part.type === 'raw')).toEqual([
        { type: 'raw', rawValue: begin },
        { type: 'raw', rawValue: speechStarted },
        { type: 'raw', rawValue: termination },
      ]);
    });

    it('finishes on a normal close after Terminate without Termination', async () => {
      const { result, socket } = await runSession({}, [turn(0, 'Done.', true)]);
      socket.serverClose(1000);

      const parts = await convertReadableStreamToArray(result.stream);
      expect(parts.at(-1)).toMatchObject({ type: 'finish', text: 'Done.' });
    });
  });

  describe('errors', () => {
    const collect = async (
      stream: ReadableStream<TranscriptionModelV4StreamPart>,
    ) => {
      const reader = stream.getReader();
      try {
        while (!(await reader.read()).done);
        return undefined;
      } catch (error) {
        return error as Error;
      }
    };

    it('fails with the server error and close code', async () => {
      const { result, socket } = await startStream();
      socket.open();
      socket.message({
        type: 'Error',
        error_code: 3006,
        error: 'Invalid language code',
      });
      await flush();

      expect((await collect(result.stream))?.message).toBe(
        'AssemblyAI streaming transcription session closed before completion (code 3006: Invalid language code): invalid session parameters or messages, or the session timed out from inactivity.',
      );
      expect(socket.close).toHaveBeenCalledWith(1000);
    });

    it('fails when the server closes before the audio ends', async () => {
      const { result, socket } = await startStream({
        audio: new ReadableStream({}),
      });
      socket.open();
      socket.message(begin);
      await flush();
      socket.serverClose(1008, 'Unauthorized');

      expect((await collect(result.stream))?.message).toContain(
        '(code 1008: Unauthorized): invalid or expired credentials',
      );
    });

    it('fails on malformed server messages', async () => {
      const { result, socket } = await startStream();
      socket.open();
      socket.message({ type: 'Turn', transcript: 1 });
      await flush();

      expect(await collect(result.stream)).toBeInstanceOf(Error);
    });

    it('cancels the audio and closes the socket when the consumer cancels', async () => {
      const cancelAudio = vi.fn();
      const { result, socket } = await startStream({
        audio: new ReadableStream({ cancel: cancelAudio }),
      });
      socket.open();
      socket.message(begin);
      await flush();

      await result.stream.cancel();
      await flush();

      expect(cancelAudio).toHaveBeenCalled();
      expect(socket.close).toHaveBeenCalledWith(1000);
    });
  });
});
