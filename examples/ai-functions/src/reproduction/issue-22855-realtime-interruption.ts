import assert from 'node:assert/strict';
import {
  Experimental_AbstractRealtimeSession as AbstractRealtimeSession,
  experimental_encodeRealtimeAudio as encodeRealtimeAudio,
  type Experimental_RealtimeModel as RealtimeModel,
  type Experimental_RealtimeServerEvent as RealtimeServerEvent,
  type Experimental_RealtimeState as RealtimeState,
} from 'ai';

const flushEvents = async () => {
  for (let index = 0; index < 100; index++) await Promise.resolve();
};

class MockWebSocket {
  static readonly OPEN = 1;
  static latest: MockWebSocket;

  readyState = 0;
  sent: Array<{ type: string; [key: string]: unknown }> = [];
  bufferedAmount = 0;
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

  async emit(event: RealtimeServerEvent & Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(event) });
    await flushEvents();
  }
}

type MockSource = {
  buffer: unknown;
  onended: (() => void) | null;
  startTime?: number;
  connect(): void;
  disconnect(): void;
  stop(): void;
  start(time: number): void;
};

class MockAudioContext {
  static latest: MockAudioContext;

  currentTime = 0;
  state = 'running';
  destination = {};
  sources: MockSource[] = [];
  onstatechange: (() => void) | null = null;
  readonly sampleRate: number;

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
    return {
      duration: length / rate,
      getChannelData: () => new Float32Array(length),
    };
  }

  createBufferSource(): MockSource {
    const source: MockSource = {
      buffer: null,
      onended: null,
      connect() {},
      disconnect() {},
      stop() {},
      start(time) {
        this.startTime = time;
      },
    };
    this.sources.push(source);
    return source;
  }
}

class Session extends AbstractRealtimeSession {
  protected setState<K extends keyof RealtimeState>(
    _key: K,
    _value: RealtimeState[K],
  ) {}
}

const model: RealtimeModel = {
  specificationVersion: 'v4',
  provider: 'mock',
  modelId: 'mock',
  getWebSocketConfig: ({ url }) => ({ url }),
  parseServerEvent: event => event as RealtimeServerEvent,
  serializeClientEvent: async event => event,
  buildSessionConfig: () => ({}),
};

async function main() {
  Object.assign(globalThis, {
    WebSocket: MockWebSocket,
    AudioContext: MockAudioContext,
    fetch: async () =>
      Response.json({
        token: 'synthetic-token',
        url: 'wss://mock.invalid',
      }),
  });

  const errors: string[] = [];
  const session = new Session({
    model,
    api: { token: '/mock-token' },
    onError: error => errors.push(error.message),
  });

  try {
    await session.connect({ capture: false });
    const socket = MockWebSocket.latest;
    socket.open();
    await flushEvents();
    await socket.emit({
      type: 'session-created',
      sessionId: 'session',
      raw: {},
    });

    const oneSecond = encodeRealtimeAudio(new Float32Array(24_000));
    await socket.emit({
      type: 'audio-delta',
      responseId: 'response-1',
      itemId: 'first',
      delta: oneSecond,
      raw: {},
    });

    MockAudioContext.latest.currentTime = 0.25;
    await socket.emit({
      type: 'audio-delta',
      responseId: 'response-2',
      itemId: 'second',
      delta: oneSecond,
      raw: {},
    });

    const scheduledStarts = MockAudioContext.latest.sources.map(
      source => source.startTime,
    );
    await socket.emit({
      type: 'speech-started',
      audioStartMs: 250,
      itemId: 'user',
      raw: {},
    });

    const truncations = socket.sent.filter(
      event => event.type === 'conversation-item-truncate',
    );
    console.log(JSON.stringify({ scheduledStarts, truncations, errors }));

    assert.deepEqual(errors, [], 'mocked session must not report errors');
    assert.deepEqual(
      scheduledStarts,
      [0, 1],
      'the second item must still be queued when interruption occurs',
    );

    const playingItemWasTruncated = truncations.some(
      event => event.itemId === 'first' && event.audioEndMs === 250,
    );
    if (!playingItemWasTruncated) {
      throw new Error(
        'ISSUE_22855: interruption did not truncate the currently playing first item at 250ms',
      );
    }
  } finally {
    session.dispose();
  }
}

await main();
