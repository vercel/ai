import assert from 'node:assert/strict';
import {
  Experimental_AbstractRealtimeSession,
  type Experimental_RealtimeModel,
  type Experimental_RealtimeState,
} from 'ai';

class FakeSocket {
  static readonly OPEN = 1;
  static instance: FakeSocket;

  readyState = FakeSocket.OPEN;
  readonly sent: Array<Record<string, unknown>> = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;

  constructor() {
    FakeSocket.instance = this;
  }

  send(value: string) {
    this.sent.push(JSON.parse(value));
  }

  close() {
    this.readyState = 3;
  }
}

Object.defineProperty(globalThis, 'WebSocket', {
  configurable: true,
  value: FakeSocket,
});
Object.defineProperty(globalThis, 'AudioContext', {
  configurable: true,
  value: class {
    state = 'running';
    currentTime = 0;
    async close() {}
  },
});

class Session extends Experimental_AbstractRealtimeSession {
  protected setState<K extends keyof Experimental_RealtimeState>(
    _key: K,
    _value: Experimental_RealtimeState[K],
  ) {}

  get messages() {
    return this.state.messages;
  }
}

const model = {
  specificationVersion: 'v4',
  provider: 'mock',
  modelId: 'mock',
  capabilities: { connections: ['server-websocket'] },
  parseServerEvent: (event: unknown) => event,
  serializeClientEvent: async (event: unknown) => event,
} as unknown as Experimental_RealtimeModel;

async function runScenario({
  argumentsJson,
  withArgumentsDelta,
}: {
  argumentsJson: string;
  withArgumentsDelta: boolean;
}) {
  let seen = 0;
  let executed = 0;
  const errors: Error[] = [];
  const session = new Session({
    model,
    onToolCall: () => {
      executed++;
      return 'done';
    },
    api: { websocket: 'ws://localhost/mock' },
    onEvent: () => {
      seen++;
    },
    onError: error => {
      errors.push(error);
    },
  });

  await session.connect({ capture: false });
  const socket = FakeSocket.instance;
  socket.onopen?.();

  async function emit(event: Record<string, unknown>) {
    const expected = seen + 1;
    socket.onmessage?.({ data: JSON.stringify({ ...event, raw: {} }) });
    for (let i = 0; i < 100; i++) {
      if (seen >= expected) break;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    assert.equal(seen, expected, `event was not processed: ${event.type}`);
  }

  await emit({ type: 'session-created', sessionId: 'session' });
  await emit({ type: 'response-created', responseId: 'response' });
  if (withArgumentsDelta) {
    await emit({
      type: 'function-call-arguments-delta',
      responseId: 'response',
      itemId: 'item',
      callId: 'call',
      delta: argumentsJson,
    });
  }
  await emit({
    type: 'function-call-arguments-done',
    responseId: 'response',
    itemId: 'item',
    callId: 'call',
    name: 'task',
    arguments: argumentsJson,
  });
  await emit({
    type: 'response-done',
    responseId: 'response',
    status: 'completed',
  });
  await new Promise(resolve => setTimeout(resolve, 0));

  const parts = session.messages.flatMap(message => message.parts);
  const submitted = socket.sent.some(
    event =>
      event.type === 'conversation-item-create' &&
      (event.item as { type?: string } | undefined)?.type ===
        'function-call-output',
  );
  session.dispose();

  return { errors, executed, parts, submitted };
}

async function main() {
  const deltaThenDone = await runScenario({
    argumentsJson: '{"value":1}',
    withArgumentsDelta: true,
  });
  assert.deepEqual(deltaThenDone.errors, []);
  assert.equal(deltaThenDone.executed, 1);
  assert.equal(deltaThenDone.submitted, true);
  assert.equal(
    deltaThenDone.parts.length,
    1,
    'delta-plus-done must create exactly one tool part',
  );
  assert.deepEqual(deltaThenDone.parts[0], {
    type: 'dynamic-tool',
    toolName: 'task',
    toolCallId: 'call',
    state: 'output-available',
    input: { value: 1 },
    output: 'done',
  });

  const finalOnly = await runScenario({
    argumentsJson: '{"value":1}',
    withArgumentsDelta: false,
  });
  const finalOnlyEmptyInput = await runScenario({
    argumentsJson: '{}',
    withArgumentsDelta: false,
  });
  assert.deepEqual(finalOnly.errors, []);
  assert.equal(finalOnly.executed, 1);
  assert.equal(finalOnly.submitted, true);
  assert.deepEqual(finalOnlyEmptyInput.errors, []);
  assert.equal(finalOnlyEmptyInput.executed, 1);
  assert.equal(finalOnlyEmptyInput.submitted, true);

  if (
    finalOnly.parts.length !== 1 ||
    finalOnly.parts[0]?.type !== 'dynamic-tool' ||
    finalOnly.parts[0].toolName !== 'task' ||
    finalOnly.parts[0].toolCallId !== 'call' ||
    finalOnly.parts[0].state !== 'output-available' ||
    !('input' in finalOnly.parts[0]) ||
    JSON.stringify(finalOnly.parts[0].input) !== '{"value":1}' ||
    !('output' in finalOnly.parts[0]) ||
    finalOnly.parts[0].output !== 'done' ||
    finalOnlyEmptyInput.parts.length !== 1 ||
    finalOnlyEmptyInput.parts[0]?.type !== 'dynamic-tool' ||
    finalOnlyEmptyInput.parts[0].state !== 'output-available' ||
    !('input' in finalOnlyEmptyInput.parts[0]) ||
    JSON.stringify(finalOnlyEmptyInput.parts[0].input) !== '{}'
  ) {
    throw new Error(
      `ISSUE_22599_FINAL_ONLY_TOOL_PART_MISSING: nonEmpty=${JSON.stringify(finalOnly.parts)} empty=${JSON.stringify(finalOnlyEmptyInput.parts)}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
