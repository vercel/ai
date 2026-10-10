import { isDeepStrictEqual } from 'node:util';
import {
  Experimental_AbstractRealtimeSession,
  type Experimental_RealtimeModel,
  type Experimental_RealtimeServerEvent,
  type Experimental_RealtimeState,
  type UIMessage,
} from 'ai';

class FakeWebSocket {
  static readonly OPEN = 1;
  static instance: FakeWebSocket;

  readyState = FakeWebSocket.OPEN;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor() {
    FakeWebSocket.instance = this;
  }

  send(value: string) {
    this.sent.push(JSON.parse(value));
  }

  close() {
    this.readyState = 3;
  }
}

class FakeAudioContext {
  state: AudioContextState = 'running';
  currentTime = 0;
  onstatechange: (() => void) | null = null;

  async close() {
    this.state = 'closed';
  }
}

class Session extends Experimental_AbstractRealtimeSession {
  protected setState<K extends keyof Experimental_RealtimeState>(
    _key: K,
    _value: Experimental_RealtimeState[K],
  ) {}

  get messages(): UIMessage[] {
    return this.state.messages;
  }
}

type Operation =
  | { type: 'commit'; itemId: string }
  | { type: 'transcript'; itemId: string; text: string }
  | { type: 'assistant'; itemId: string; text: string };

const model: Experimental_RealtimeModel = {
  specificationVersion: 'v4',
  provider: 'mock',
  modelId: 'mock',
  capabilities: {
    conversation: 'turn-based',
    transports: ['websocket'],
    connections: ['server-websocket'],
  },
  parseServerEvent: raw => raw as Experimental_RealtimeServerEvent,
  serializeClientEvent: async event => event,
  buildSessionConfig: config => config,
};

const scenarios: Array<{
  name: string;
  operations: Operation[];
  expected: string[];
}> = [
  {
    name: 'transcripts complete in commit order',
    operations: [
      { type: 'commit', itemId: 'a' },
      { type: 'commit', itemId: 'b' },
      { type: 'transcript', itemId: 'a', text: 'first turn' },
      { type: 'transcript', itemId: 'b', text: 'second turn' },
    ],
    expected: ['user:first turn', 'user:second turn'],
  },
  {
    name: 'transcripts complete in reverse order',
    operations: [
      { type: 'commit', itemId: 'a' },
      { type: 'commit', itemId: 'b' },
      { type: 'transcript', itemId: 'b', text: 'second turn' },
      { type: 'transcript', itemId: 'a', text: 'first turn' },
    ],
    expected: ['user:first turn', 'user:second turn'],
  },
  {
    name: 'assistant message occurs between audio commits',
    operations: [
      { type: 'commit', itemId: 'a' },
      {
        type: 'assistant',
        itemId: 'assistant-between',
        text: 'assistant turn',
      },
      { type: 'commit', itemId: 'b' },
      { type: 'transcript', itemId: 'a', text: 'first turn' },
      { type: 'transcript', itemId: 'b', text: 'second turn' },
    ],
    expected: [
      'user:first turn',
      'assistant:assistant turn',
      'user:second turn',
    ],
  },
  {
    name: 'assistant message and reverse transcription completion',
    operations: [
      { type: 'commit', itemId: 'a' },
      {
        type: 'assistant',
        itemId: 'assistant-between',
        text: 'assistant turn',
      },
      { type: 'commit', itemId: 'b' },
      { type: 'transcript', itemId: 'b', text: 'second turn' },
      { type: 'transcript', itemId: 'a', text: 'first turn' },
    ],
    expected: [
      'user:first turn',
      'assistant:assistant turn',
      'user:second turn',
    ],
  },
  {
    name: 'repeated transcription updates replace the same item',
    operations: [
      { type: 'commit', itemId: 'a' },
      { type: 'commit', itemId: 'b' },
      { type: 'transcript', itemId: 'a', text: 'first draft' },
      { type: 'transcript', itemId: 'a', text: 'first turn' },
      { type: 'transcript', itemId: 'b', text: 'second turn' },
    ],
    expected: ['user:first turn', 'user:second turn'],
  },
];

function messageLabels(messages: UIMessage[]): string[] {
  return messages.map(message => {
    const textPart = message.parts.find(part => part.type === 'text');
    return `${message.role}:${textPart?.text ?? '<no text>'}`;
  });
}

async function runScenario(operations: Operation[]): Promise<string[]> {
  let seen = 0;
  let resolveEvent: (() => void) | undefined;
  const errors: Error[] = [];
  const session = new Session({
    model,
    api: { websocket: 'ws://localhost/mock' },
    onEvent: () => {
      seen++;
      resolveEvent?.();
      resolveEvent = undefined;
    },
    onError: error => {
      errors.push(error);
    },
  });

  const emit = async (event: Experimental_RealtimeServerEvent) => {
    const expectedSeen = seen + 1;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolveEvent = undefined;
        reject(
          new Error(
            `Synthetic realtime event was not processed: ${event.type}`,
            {
              cause: errors[0],
            },
          ),
        );
      }, 1_000);
      resolveEvent = () => {
        clearTimeout(timeout);
        resolve();
      };
      FakeWebSocket.instance.onmessage?.({ data: JSON.stringify(event) });
    });

    if (seen !== expectedSeen)
      throw new Error(`Synthetic realtime event was processed more than once`);
  };

  try {
    await session.connect({ capture: false });
    FakeWebSocket.instance.onopen?.();
    await emit({ type: 'session-created', sessionId: 'session', raw: {} });

    let assistantResponse = 0;
    for (const operation of operations) {
      if (operation.type === 'commit') {
        await emit({
          type: 'audio-committed',
          itemId: operation.itemId,
          raw: {},
        });
      } else if (operation.type === 'transcript') {
        await emit({
          type: 'input-transcription-completed',
          itemId: operation.itemId,
          transcript: operation.text,
          raw: {},
        });
      } else {
        const responseId = `response-${assistantResponse++}`;
        await emit({
          type: 'text-delta',
          responseId,
          itemId: operation.itemId,
          delta: operation.text,
          raw: {},
        });
        await emit({
          type: 'text-done',
          responseId,
          itemId: operation.itemId,
          text: operation.text,
          raw: {},
        });
        await emit({
          type: 'response-done',
          responseId,
          status: 'completed',
          raw: {},
        });
      }
    }

    return messageLabels(session.messages);
  } finally {
    session.dispose();
  }
}

async function main() {
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext;

  const failures: Array<{
    name: string;
    expected: string[];
    actual: string[];
  }> = [];

  for (const scenario of scenarios) {
    const actual = await runScenario(scenario.operations);
    console.log(
      JSON.stringify({
        scenario: scenario.name,
        expected: scenario.expected,
        actual,
      }),
    );

    if (!isDeepStrictEqual(actual, scenario.expected)) {
      failures.push({
        name: scenario.name,
        expected: scenario.expected,
        actual,
      });
    }
  }

  if (failures.length > 0) {
    console.error(JSON.stringify({ failures }, null, 2));
    throw new Error(
      'ISSUE_22594: realtime transcript history did not preserve committed conversation order',
    );
  }
}

await main();
