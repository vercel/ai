import assert from 'node:assert/strict';
import {
  Experimental_AbstractRealtimeSession as AbstractRealtimeSession,
  type Experimental_RealtimeServerEvent as RealtimeServerEvent,
  type Experimental_RealtimeState as RealtimeState,
} from 'ai';

const flushEvents = async () => {
  for (let index = 0; index < 100; index++) {
    await Promise.resolve();
  }
};

class MockWebSocket {
  static readonly OPEN = 1;
  static latest: MockWebSocket;

  readyState = 0;
  bufferedAmount = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

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
    this.onmessage?.({ data: JSON.stringify({ ...event, raw: {} }) });
    await flushEvents();
  }
}

class MockAudioContext {
  currentTime = 0;
  state = 'running';
  destination = {};
  onstatechange: (() => void) | null = null;

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

  createBufferSource() {
    return {
      connect() {},
      disconnect() {},
      stop() {},
      start() {},
    };
  }
}

class Session extends AbstractRealtimeSession {
  protected setState<K extends keyof RealtimeState>(
    _key: K,
    _value: RealtimeState[K],
  ) {}

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
    specificationVersion: 'v4' as const,
    provider: 'mock',
    modelId: 'mock',
    getWebSocketConfig: ({ url }: { url: string }) => ({ url }),
    parseServerEvent: (event: unknown) => event as RealtimeServerEvent,
    serializeClientEvent: async (event: unknown) => event,
    buildSessionConfig: () => ({}),
  };
  const session = new Session({
    model,
    api: { token: '/mock-token' },
  });

  try {
    await session.connect({ capture: false });
    const socket = MockWebSocket.latest;
    socket.open();
    await flushEvents();
    await socket.emit({
      type: 'session-created',
      sessionId: 'session-1',
    });
    await socket.emit({
      type: 'text-delta',
      responseId: 'response-1',
      itemId: 'text-1',
      delta: 'Partial answer',
    });

    session.disconnect();

    const part = session.snapshot.messages
      .flatMap(message => message.parts)
      .find(candidate => candidate.type === 'text');

    assert.equal(session.snapshot.status, 'disconnected');
    assert.ok(part?.type === 'text');
    assert.equal(part.text, 'Partial answer');

    if (part.state !== 'done') {
      console.error(
        `ISSUE_22860_REPRODUCED: disconnected partial text state is "${part.state}", expected "done"`,
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      'Issue #22860 not reproduced: disconnected partial text was finalized.',
    );
  } finally {
    session.dispose();
  }
}

await main();
