import assert from 'node:assert/strict';
import {
  type DynamicToolUIPart,
  Experimental_AbstractRealtimeSession,
  type Experimental_RealtimeModel,
  type Experimental_RealtimeServerEvent,
  type Experimental_RealtimeState,
} from 'ai';

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];

  readyState = FakeSocket.OPEN;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor() {
    FakeSocket.instances.push(this);
  }

  send(value: string) {
    this.sent.push(JSON.parse(value));
  }

  close() {
    this.readyState = 3;
  }
}

class FakeAudioContext {
  state = 'running';
  currentTime = 0;

  async close() {}
}

globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
globalThis.AudioContext =
  FakeAudioContext as unknown as typeof globalThis.AudioContext;

class Session extends Experimental_AbstractRealtimeSession {
  protected setState<K extends keyof Experimental_RealtimeState>(
    _key: K,
    _value: Experimental_RealtimeState[K],
  ) {}

  get snapshot() {
    return structuredClone(this.state);
  }
}

const model: Experimental_RealtimeModel = {
  specificationVersion: 'v4',
  provider: 'mock',
  modelId: 'mock',
  capabilities: {
    conversation: 'turn-based',
    transports: ['websocket'],
    connections: ['server-websocket'],
  },
  buildSessionConfig: config => config,
  parseServerEvent: event => event as Experimental_RealtimeServerEvent,
  serializeClientEvent: async event => event,
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

type WithoutRaw<T> = T extends unknown ? Omit<T, 'raw'> : never;
type ServerEventInput = WithoutRaw<Experimental_RealtimeServerEvent>;

async function emit(
  socket: FakeSocket,
  event: ServerEventInput,
  eventsSeen: () => number,
) {
  const expected = eventsSeen() + 1;
  socket.onmessage?.({ data: JSON.stringify({ ...event, raw: {} }) });
  for (let index = 0; index < 100 && eventsSeen() < expected; index++) {
    await flush();
  }
  assert.equal(eventsSeen(), expected, `event was not handled: ${event.type}`);
}

async function emitToolCall(
  socket: FakeSocket,
  eventsSeen: () => number,
  callId: string,
) {
  await emit(
    socket,
    { type: 'response-created', responseId: `response-${callId}` },
    eventsSeen,
  );
  await emit(
    socket,
    {
      type: 'function-call-arguments-delta',
      responseId: `response-${callId}`,
      itemId: `item-${callId}`,
      callId,
      delta: '{}',
    },
    eventsSeen,
  );
  await emit(
    socket,
    {
      type: 'function-call-arguments-done',
      responseId: `response-${callId}`,
      itemId: `item-${callId}`,
      callId,
      name: 'task',
      arguments: '{}',
    },
    eventsSeen,
  );
  await emit(
    socket,
    {
      type: 'response-done',
      responseId: `response-${callId}`,
      status: 'completed',
    },
    eventsSeen,
  );
}

async function ready(session: Session, eventsSeen: () => number) {
  await session.connect({ capture: false });
  const socket = FakeSocket.instances.at(-1);
  assert.ok(socket, 'connect did not create a WebSocket');
  socket.onopen?.();
  await emit(
    socket,
    { type: 'session-created', sessionId: 'session' },
    eventsSeen,
  );
  return socket;
}

function getOnlyToolPart(session: Session): DynamicToolUIPart {
  const parts = session.snapshot.messages
    .flatMap(message => message.parts)
    .filter((part): part is DynamicToolUIPart => part.type === 'dynamic-tool');
  assert.equal(parts.length, 1, 'expected exactly one tool part');
  return parts[0];
}

async function observeFailure(mode: 'sync' | 'async') {
  let seen = 0;
  let executed = 0;
  const errors: string[] = [];
  const message = `${mode} synthetic lookup failed`;
  const session = new Session({
    model,
    api: { websocket: 'ws://localhost/mock' },
    onEvent: () => seen++,
    onError: error => errors.push(error.message),
    onToolCall:
      mode === 'sync'
        ? () => {
            executed++;
            throw new Error(message);
          }
        : async () => {
            executed++;
            throw new Error(message);
          },
  });

  const socket = await ready(session, () => seen);
  await emitToolCall(socket, () => seen, `${mode}-call`);
  await flush();

  const failedPart = getOnlyToolPart(session);

  session.addToolOutput(`${mode}-call`, { retried: true });
  const retriedPart = getOnlyToolPart(session);
  session.dispose();

  return { mode, executed, errors, message, failedPart, retriedPart };
}

async function verifyStaleRejectionIsFenced() {
  let seen = 0;
  const errors: string[] = [];
  let rejectOldTool!: (error: Error) => void;
  const oldTool = new Promise<never>((_resolve, reject) => {
    rejectOldTool = reject;
  });
  const session = new Session({
    model,
    api: { websocket: 'ws://localhost/mock' },
    onEvent: () => seen++,
    onError: error => errors.push(error.message),
    onToolCall: () => oldTool,
  });

  const oldSocket = await ready(session, () => seen);
  await emitToolCall(oldSocket, () => seen, 'old-call');
  session.disconnect();
  await ready(session, () => seen);
  const beforeRejection = session.snapshot.messages;

  rejectOldTool(new Error('stale lookup failed'));
  await flush();
  await flush();

  assert.deepEqual(
    session.snapshot.messages,
    beforeRejection,
    'a tool rejection from an old connection attempt changed current messages',
  );
  assert.deepEqual(
    errors,
    [],
    'a tool rejection from an old connection attempt reached onError',
  );
  session.dispose();
}

async function main() {
  const observations = [
    await observeFailure('sync'),
    await observeFailure('async'),
  ];

  for (const observation of observations) {
    assert.equal(observation.executed, 1);
    assert.deepEqual(observation.errors, [observation.message]);
    assert.ok(
      observation.failedPart,
      `${observation.mode} tool part was missing`,
    );
    assert.equal(observation.retriedPart?.state, 'output-available');
    assert.deepEqual(
      'output' in observation.retriedPart
        ? observation.retriedPart.output
        : undefined,
      { retried: true },
    );
  }

  await verifyStaleRejectionIsFenced();

  const failures = observations.filter(
    ({ failedPart, message }) =>
      failedPart?.state !== 'output-error' ||
      !('errorText' in failedPart) ||
      failedPart.errorText !== message,
  );

  if (failures.length > 0) {
    const states = failures
      .map(
        ({ mode, failedPart }) => `${mode}=${failedPart?.state ?? 'missing'}`,
      )
      .join(', ');
    throw new Error(
      `ISSUE #22624 REPRODUCED: failed realtime tool execution remained non-terminal (${states}) instead of output-error with its error text`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
