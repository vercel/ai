import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import type { Experimental_SpeechModelV4StreamTextPart as SpeechModelV4StreamTextPart } from '@ai-sdk/provider';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayAuthenticationError, GatewayRateLimitError } from './errors';
import type { GatewayConfig } from './gateway-config';
import {
  GatewaySpeechModel,
  splitTextDelta,
  toGatewaySpeechUrl,
} from './gateway-speech-model';

function textParts(texts: string[]) {
  return convertArrayToReadableStream<SpeechModelV4StreamTextPart>(
    texts.map(text => ({ type: 'text', text })),
  );
}

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

  remoteClose(code = 1011) {
    this.readyState = 3;
    this.onclose?.({ code });
  }

  sentFrames() {
    return this.send.mock.calls.map(([data]) => JSON.parse(String(data)));
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const createStreamingTestModel = (
  config: Partial<
    GatewayConfig & {
      headers?: () => Record<string, string>;
      _internal?: { currentDate?: () => Date };
    }
  > = {},
) =>
  new GatewaySpeechModel('elevenlabs/eleven-flash-v2.5', {
    provider: 'gateway',
    baseURL: 'https://api.test.com',
    headers: () => ({
      Authorization: 'Bearer test-token',
      'ai-gateway-auth-method': 'api-key',
    }),
    fetch: globalThis.fetch,
    o11yHeaders: {},
    webSocket: MockWebSocket,
    ...config,
  });

function lastSocket(): MockWebSocket {
  const socket = MockWebSocket.instances.at(-1);
  if (socket == null) {
    throw new Error('no socket');
  }
  return socket;
}

describe('GatewaySpeechModel.doStream', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
  });

  it('should speak the speech-stream envelope over the gateway WebSocket', async () => {
    const result = await createStreamingTestModel({
      _internal: { currentDate: () => new Date(2024, 0, 1) },
    }).doStream({
      text: convertArrayToReadableStream<SpeechModelV4StreamTextPart>([
        { type: 'text', text: 'Hello ' },
        {
          type: 'text',
          text: 'world',
          voice: 'voice-2',
          providerOptions: { elevenlabs: { newTurn: true } },
        },
      ]),
      voice: 'voice-1',
      outputFormat: { type: 'audio/mpeg' },
      speed: 1.1,
      language: 'en',
      providerOptions: { elevenlabs: { seed: 7 } },
    });

    const socket = lastSocket();
    expect(String(socket.url)).toBe(
      'wss://api.test.com/speech-model?ai-model-id=elevenlabs%2Feleven-flash-v2.5',
    );
    expect(socket.protocols).toEqual([
      'ai-gateway-speech.v1',
      'ai-gateway-auth.test-token',
    ]);
    expect(result.request?.body).toEqual({
      type: 'speech-stream.start',
      voice: 'voice-1',
      outputFormat: { type: 'audio/mpeg' },
      speed: 1.1,
      language: 'en',
      providerOptions: { elevenlabs: { seed: 7 } },
    });
    expect(result.response).toEqual({
      timestamp: new Date(2024, 0, 1),
      modelId: 'elevenlabs/eleven-flash-v2.5',
    });

    socket.open();
    await flush();
    await flush();

    expect(socket.sentFrames()).toEqual([
      {
        type: 'speech-stream.start',
        voice: 'voice-1',
        outputFormat: { type: 'audio/mpeg' },
        speed: 1.1,
        language: 'en',
        providerOptions: { elevenlabs: { seed: 7 } },
      },
      { type: 'speech-stream.text-delta', delta: 'Hello ' },
      {
        type: 'speech-stream.text-delta',
        delta: 'world',
        voice: 'voice-2',
        providerOptions: { elevenlabs: { newTurn: true } },
      },
      { type: 'speech-stream.text-done' },
    ]);

    socket.message({ type: 'stream-start', warnings: [] });
    socket.message({
      type: 'audio',
      audio: 'AQI=',
      audioFormat: { type: 'audio/mpeg', rate: 44100 },
    });
    socket.message({ type: 'unknown-part' });
    socket.message({
      type: 'finish',
      usage: { inputCharacters: 11 },
      providerMetadata: { gateway: { cost: '0.00044' } },
    });

    expect(await convertReadableStreamToArray(result.stream)).toEqual([
      { type: 'stream-start', warnings: [] },
      {
        type: 'audio',
        audio: 'AQI=',
        audioFormat: { type: 'audio/mpeg', rate: 44100 },
      },
      {
        type: 'finish',
        usage: { inputCharacters: 11 },
        providerMetadata: { gateway: { cost: '0.00044' } },
      },
    ]);
    expect(socket.close).toHaveBeenCalledWith(1000);
  });

  it('should put the voice on every frame of a split part and its provider options on the first only', async () => {
    const long = 'x'.repeat(70 * 1024);
    await createStreamingTestModel().doStream({
      text: convertArrayToReadableStream<SpeechModelV4StreamTextPart>([
        {
          type: 'text',
          text: long,
          voice: 'voice-2',
          providerOptions: { elevenlabs: { newTurn: true } },
        },
      ]),
    });
    const socket = lastSocket();
    socket.open();
    await flush();
    await flush();

    const deltas = socket
      .sentFrames()
      .filter(frame => frame.type === 'speech-stream.text-delta');
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.every(frame => frame.voice === 'voice-2')).toBe(true);
    expect(deltas[0].providerOptions).toEqual({
      elevenlabs: { newTurn: true },
    });
    expect(deltas.slice(1).some(frame => 'providerOptions' in frame)).toBe(
      false,
    );
    expect(deltas.map(frame => frame.delta).join('')).toBe(long);
  });

  it('should include the team subprotocol when a team header is set', async () => {
    await createStreamingTestModel({
      headers: () => ({
        Authorization: 'Bearer test-token',
        'x-vercel-ai-gateway-team': 'my-team',
      }),
    }).doStream({ text: textParts(['Hi']) });

    expect(lastSocket().protocols).toEqual([
      'ai-gateway-speech.v1',
      'ai-gateway-auth.test-token',
      'ai-gateway-team.bXktdGVhbQ',
    ]);
  });

  it('should surface a typed gateway error from a server error part', async () => {
    const result = await createStreamingTestModel().doStream({
      text: textParts(['Hi']),
    });
    const socket = lastSocket();
    socket.open();
    await flush();
    socket.message({
      type: 'error',
      error: { message: 'Rate limited', type: 'rate_limit_exceeded' },
    });
    socket.remoteClose(1008);

    const reader = result.stream.getReader();
    expect(await reader.read()).toMatchObject({
      value: { type: 'error' },
    });
    await expect(reader.read()).rejects.toSatisfy(error =>
      GatewayRateLimitError.isInstance(error),
    );
  });

  it('should expose a typed error to audio-stream consumers', async () => {
    const result = await createStreamingTestModel().doStream({
      text: textParts(['Hi']),
    });
    const reader = result.stream.getReader();
    // Mirrors core's pull-based audioStream error propagation.
    const audioStream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { value } = await reader.read();
        if (value?.type === 'error') {
          controller.error(value.error);
          await reader.cancel(value.error).catch(() => {});
        }
      },
    });
    const rejection = expect(audioStream.getReader().read()).rejects.toSatisfy(
      error => GatewayRateLimitError.isInstance(error),
    );
    lastSocket().message({
      type: 'error',
      error: { message: 'Rate limited', type: 'rate_limit_exceeded' },
    });
    await rejection;
  });

  it('should error when the socket closes before a finish part', async () => {
    const result = await createStreamingTestModel().doStream({
      text: textParts(['Hi']),
    });
    const socket = lastSocket();
    socket.open();
    await flush();
    socket.remoteClose();

    await expect(convertReadableStreamToArray(result.stream)).rejects.toThrow(
      'AI Gateway speech stream closed before a finish part was received (code 1011).',
    );
  });

  it.each(['AbortError', 'TimeoutError'])(
    'should propagate an upstream text %s unchanged',
    async name => {
      const error = new DOMException('Text stream cancelled', name);
      let textController!: ReadableStreamDefaultController<SpeechModelV4StreamTextPart>;
      const result = await createStreamingTestModel().doStream({
        text: new ReadableStream<SpeechModelV4StreamTextPart>({
          start(controller) {
            textController = controller;
          },
        }),
      });
      const socket = lastSocket();
      socket.open();
      await flush();

      const reader = result.stream.getReader();
      const rejection = expect(reader.read()).rejects.toBe(error);
      textController.error(error);

      await rejection;
      await expect(reader.read()).rejects.toBe(error);
      await flush();
      expect(socket.close).toHaveBeenCalled();
    },
  );

  it('should send an empty text part that carries a voice or provider options', async () => {
    await createStreamingTestModel().doStream({
      text: convertArrayToReadableStream<SpeechModelV4StreamTextPart>([
        { type: 'text', text: '' },
        {
          type: 'text',
          text: '',
          providerOptions: { elevenlabs: { newTurn: true } },
        },
        { type: 'text', text: 'Hi', voice: 'v2' },
      ]),
    });
    const socket = lastSocket();
    socket.open();
    await flush();
    await flush();

    expect(socket.sentFrames().slice(1)).toEqual([
      {
        type: 'speech-stream.text-delta',
        delta: '',
        providerOptions: { elevenlabs: { newTurn: true } },
      },
      { type: 'speech-stream.text-delta', delta: 'Hi', voice: 'v2' },
      { type: 'speech-stream.text-done' },
    ]);
  });

  it('should map an authentication error part', async () => {
    const result = await createStreamingTestModel().doStream({
      text: textParts(['Hi']),
    });
    const socket = lastSocket();
    socket.open();
    await flush();
    socket.message({
      type: 'error',
      error: { message: 'Invalid API key', type: 'authentication_error' },
    });
    socket.remoteClose(1008);

    const parts: unknown[] = [];
    await expect(
      (async () => {
        for await (const part of result.stream) parts.push(part);
      })(),
    ).rejects.toSatisfy(error => GatewayAuthenticationError.isInstance(error));
  });

  it('should close the socket and cancel the text on stream cancel', async () => {
    const cancelText = vi.fn();
    const result = await createStreamingTestModel().doStream({
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
});

describe('toGatewaySpeechUrl', () => {
  it('should upgrade http(s) and carry the model id in the query', () => {
    expect(toGatewaySpeechUrl('http://localhost:3000/v4/ai', 'a/b')).toBe(
      'ws://localhost:3000/v4/ai/speech-model?ai-model-id=a%2Fb',
    );
  });
});

describe('splitTextDelta', () => {
  it('should return short deltas unchanged', () => {
    expect(splitTextDelta('Hello')).toEqual(['Hello']);
    expect(splitTextDelta('')).toEqual([]);
  });

  it('should not split a surrogate pair at a piece boundary', () => {
    const delta = `${'a'.repeat(8 * 1024 - 1)}👋b`;
    const pieces = splitTextDelta(delta);
    expect(pieces.join('')).toBe(delta);
    expect(pieces[0].endsWith('a')).toBe(true);
    expect(pieces[1].startsWith('👋')).toBe(true);
  });
});
