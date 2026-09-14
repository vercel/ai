import {
  Experimental_AbstractRealtimeSession,
  type Experimental_RealtimeModel,
  type Experimental_RealtimeServerEvent,
  type Experimental_RealtimeSessionOptions,
  type Experimental_RealtimeState,
} from 'ai';

const FAILURE_SIGNAL =
  'ISSUE #20695 REPRODUCED: abnormal WebSocket close code and reason did not reach the realtime session consumer';

type CloseHandler = (event: {
  code: number;
  reason: string;
  wasClean: boolean;
}) => void;

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static readonly instances: MockWebSocket[] = [];

  readonly url: string;
  readonly protocols: string | string[] | undefined;
  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: unknown) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: CloseHandler | null = null;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.instances.push(this);
  }

  send(_data: unknown): void {}

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  emitClose(code: number, reason: string): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean: true });
  }
}

class MockAudioContext {
  constructor(_options?: AudioContextOptions) {}

  close(): Promise<void> {
    return Promise.resolve();
  }
}

const model: Experimental_RealtimeModel = {
  specificationVersion: 'v4',
  provider: 'reproduction',
  modelId: 'close-diagnostics',
  async doCreateClientSecret() {
    return {
      token: 'unused',
      url: 'wss://example.test/realtime',
    };
  },
  getWebSocketConfig({ url }) {
    return { url };
  },
  parseServerEvent(raw) {
    return raw as Experimental_RealtimeServerEvent;
  },
  serializeClientEvent(event) {
    return event;
  },
  buildSessionConfig(config) {
    return config;
  },
};

class TestRealtimeSession extends Experimental_AbstractRealtimeSession {
  readonly statuses: Experimental_RealtimeState['status'][] = [];

  protected setState<K extends keyof Experimental_RealtimeState>(
    key: K,
    value: Experimental_RealtimeState[K],
  ): void {
    if (key === 'status') {
      this.statuses.push(value as Experimental_RealtimeState['status']);
    }
  }
}

type ScenarioResult = {
  terminalStatus: Experimental_RealtimeState['status'] | undefined;
  errors: Error[];
  closeCallbackValues: unknown[][];
};

async function runScenario(
  code: number,
  reason: string,
): Promise<ScenarioResult> {
  const errors: Error[] = [];
  const closeCallbackValues: unknown[][] = [];
  const options: Experimental_RealtimeSessionOptions & {
    onClose?: (...values: unknown[]) => void;
  } = {
    model,
    api: { token: '/api/realtime-token' },
    onError: error => {
      errors.push(error);
    },
    // The current public session API ignores this. Keeping it in the
    // reproduction also permits a valid fix that exposes close diagnostics
    // through a new session-level onClose callback instead of onError.
    onClose: (...values) => {
      closeCallbackValues.push(values);
    },
  };
  const session = new TestRealtimeSession(options);

  await session.connect();
  const socket = MockWebSocket.instances.at(-1);
  if (socket == null) {
    throw new Error('Reproduction setup failed: no WebSocket was constructed');
  }

  socket.emitClose(code, reason);

  return {
    terminalStatus: session.statuses.at(-1),
    errors,
    closeCallbackValues,
  };
}

function hasDiagnostic(values: unknown[], expected: string | number): boolean {
  const seen = new Set<object>();

  const visit = (value: unknown): boolean => {
    if (value === expected) return true;
    if (typeof value === 'string' && value.includes(String(expected))) {
      return true;
    }
    if (value == null || typeof value !== 'object') return false;
    if (seen.has(value)) return false;
    seen.add(value);

    if (value instanceof Error && value.message.includes(String(expected))) {
      return true;
    }

    const record = value as Record<string, unknown>;
    for (const key of ['code', 'reason', 'message', 'cause']) {
      if (visit(record[key])) return true;
    }

    return Array.isArray(value) && value.some(visit);
  };

  return values.some(visit);
}

async function main(): Promise<void> {
  const globals = globalThis as unknown as Record<string, unknown>;
  const originalFetch = globals.fetch;
  const originalWebSocket = globals.WebSocket;
  const originalAudioContext = globals.AudioContext;

  globals.fetch = async () =>
    new Response(
      JSON.stringify({
        token: 'test-token',
        url: 'wss://example.test/realtime',
        tools: [],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  globals.WebSocket = MockWebSocket;
  globals.AudioContext = MockAudioContext;

  try {
    const clean = await runScenario(1000, '');
    const abnormal = await runScenario(
      1007,
      'Request contains an invalid argument',
    );

    const consumerValues: unknown[] = [
      ...abnormal.errors,
      ...abnormal.closeCallbackValues,
    ];
    const codeObservable = hasDiagnostic(consumerValues, 1007);
    const reasonObservable = hasDiagnostic(
      consumerValues,
      'Request contains an invalid argument',
    );
    const indistinguishable =
      clean.terminalStatus === abnormal.terminalStatus &&
      clean.errors.length === abnormal.errors.length &&
      clean.closeCallbackValues.length === abnormal.closeCallbackValues.length;

    console.log(`clean close terminal status: ${clean.terminalStatus}`);
    console.log(`abnormal close terminal status: ${abnormal.terminalStatus}`);
    console.log(`abnormal close onError calls: ${abnormal.errors.length}`);
    console.log(
      `abnormal close session onClose calls: ${abnormal.closeCallbackValues.length}`,
    );
    console.log(`code 1007 observable: ${codeObservable}`);
    console.log(`close reason observable: ${reasonObservable}`);
    console.log(
      `clean and abnormal closes indistinguishable: ${indistinguishable}`,
    );

    if (!codeObservable || !reasonObservable) {
      console.error(FAILURE_SIGNAL);
      process.exitCode = 1;
      return;
    }

    console.log(
      'PASS: abnormal WebSocket close code and reason reached the realtime session consumer',
    );
  } finally {
    globals.fetch = originalFetch;
    globals.WebSocket = originalWebSocket;
    globals.AudioContext = originalAudioContext;
  }
}

await main();
