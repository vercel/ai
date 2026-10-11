import assert from 'node:assert/strict';
import {
  Experimental_AbstractRealtimeSession as AbstractRealtimeSession,
  type Experimental_RealtimeModel as RealtimeModel,
} from 'ai';

const failureSignal =
  'ISSUE #22856 reproduced: audio/pcmu was accepted but played as PCM16 at 24000 Hz';

const flushMicrotasks = async () => {
  for (let index = 0; index < 100; index++) {
    await Promise.resolve();
  }
};

class MockWebSocket {
  static readonly OPEN = 1;
  static latest: MockWebSocket | undefined;

  readyState = 0;
  bufferedAmount = 0;
  readonly sent: Array<Record<string, unknown>> = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;

  constructor() {
    MockWebSocket.latest = this;
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = 3;
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  async emit(event: Record<string, unknown>) {
    this.onmessage?.({
      data: JSON.stringify({ ...event, raw: {} }),
    });
    await flushMicrotasks();
  }
}

class MockAudioBuffer {
  readonly samples: Float32Array;
  readonly duration: number;

  constructor(length: number, rate: number) {
    this.samples = new Float32Array(length);
    this.duration = length / rate;
  }

  getChannelData() {
    return this.samples;
  }
}

class MockAudioBufferSource {
  buffer?: MockAudioBuffer;
  onended?: () => void;
  startTime?: number;

  connect() {}
  disconnect() {}
  stop() {}

  start(time: number) {
    this.startTime = time;
  }
}

class MockAudioContext {
  static latest: MockAudioContext | undefined;

  readonly sampleRate: number;
  readonly sources: MockAudioBufferSource[] = [];
  readonly destination = {};
  currentTime = 0;
  state = 'running';
  onstatechange?: () => void;

  constructor({ sampleRate }: { sampleRate: number }) {
    this.sampleRate = sampleRate;
    MockAudioContext.latest = this;
  }

  async resume() {
    this.state = 'running';
  }

  async close() {
    this.state = 'closed';
  }

  createBuffer(_channels: number, length: number, rate: number) {
    return new MockAudioBuffer(length, rate);
  }

  createBufferSource() {
    const source = new MockAudioBufferSource();
    this.sources.push(source);
    return source;
  }
}

class TestSession extends AbstractRealtimeSession {
  protected setState(): void {}

  get snapshot() {
    return this.state;
  }
}

async function main() {
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext;
  globalThis.fetch = async () =>
    Response.json({
      token: 'synthetic-token',
      url: 'wss://mock.invalid',
    });

  const model = {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock',
    getWebSocketConfig: ({ url }: { url: string }) => ({ url }),
    parseServerEvent: (event: unknown) => event,
    serializeClientEvent: async (event: unknown) => event,
    buildSessionConfig: () => ({}),
  } as RealtimeModel;

  const errors: string[] = [];
  const session = new TestSession({
    model,
    api: { token: '/mock-token' },
    sessionConfig: {
      outputAudioFormat: { type: 'audio/pcmu' },
    },
    onError: error => errors.push(error.message),
  });

  try {
    await session.connect({ capture: false });

    const socket = MockWebSocket.latest;
    if (socket != null) {
      socket.open();
      await flushMicrotasks();
      await socket.emit({ type: 'session-created', sessionId: 'session' });

      // G.711 mu-law silence is 0xff. 8000 bytes are one second at 8 kHz.
      const oneSecondPcmuSilence = Buffer.alloc(8000, 0xff).toString('base64');
      await socket.emit({
        type: 'audio-delta',
        responseId: 'response',
        itemId: 'audio',
        delta: oneSecondPcmuSilence,
      });
    }

    const audioContext = MockAudioContext.latest;
    const buffer = audioContext?.sources[0]?.buffer;
    const result = {
      errors,
      sampleRate: audioContext?.sampleRate,
      duration: buffer?.duration,
      sampleCount: buffer?.getChannelData().length,
      firstSample: buffer?.getChannelData()[0],
    };
    console.log(result);

    const explicitlyRejected =
      buffer == null &&
      errors.some(message =>
        /audio\/pcmu|unsupported.*codec|supports PCM16 only/i.test(message),
      );
    const decodedCorrectly =
      buffer != null &&
      Math.abs(buffer.duration - 1) < 1e-9 &&
      buffer.getChannelData().length === 8000 &&
      Math.abs(buffer.getChannelData()[0] ?? Number.NaN) < 1e-9;

    if (
      errors.length === 0 &&
      audioContext?.sampleRate === 24000 &&
      buffer?.getChannelData().length === 4000 &&
      Math.abs(buffer.duration - 1 / 6) < 1e-9 &&
      buffer.getChannelData()[0] === -1 / 32768
    ) {
      throw new Error(failureSignal);
    }

    assert.ok(
      explicitlyRejected || decodedCorrectly,
      'audio/pcmu must be rejected explicitly before playback or decoded as one second of 8 kHz mu-law silence',
    );
  } finally {
    session.dispose();
  }
}

await main();
