import { describe, expect, it } from 'vitest';
import {
  encodeSpeechEngineEvent,
  parseSpeechEngineClientEvent,
  parseSpeechEngineServerEvent,
} from './gateway-speech-engine';
import {
  GatewaySpeechEngineSession,
  type SpeechEngineWebSocketLike,
} from './gateway-speech-engine-session';

describe('speech-engine codec', () => {
  it('round-trips a server event', () => {
    const wire = encodeSpeechEngineEvent(1, {
      type: 'input.transcript.final',
      data: { text: 'hello', itemId: 'item_1' },
    });
    expect(parseSpeechEngineServerEvent(wire)).toEqual({
      type: 'input.transcript.final',
      data: { text: 'hello', itemId: 'item_1' },
    });
  });

  it('round-trips a client event with turnId', () => {
    const wire = encodeSpeechEngineEvent(2, {
      type: 'response.delta',
      data: { text: 'hi there', turnId: 'turn_1' },
    });
    expect(parseSpeechEngineClientEvent(wire)).toEqual({
      type: 'response.delta',
      data: { text: 'hi there', turnId: 'turn_1' },
    });
  });

  it('parses the engine capability handshake', () => {
    const wire = encodeSpeechEngineEvent(0, {
      type: 'session.opened',
      data: {
        sessionId: 's1',
        engine: {
          provider: 'openai',
          model: 'gpt-realtime-2',
          protocol: 'openai',
          capabilities: {
            'input.transcript.final': true,
            'input.transcript.partial': false,
            'input.speech.started': true,
            'input.interrupted': true,
            'output.audio': false,
            'output.cancel': true,
            'output.exactReadout': false,
          },
        },
      },
    });
    const parsed = parseSpeechEngineServerEvent(wire);
    expect(parsed?.type).toBe('session.opened');
    expect(
      parsed?.type === 'session.opened' &&
        parsed.data.engine?.capabilities['output.audio'],
    ).toBe(false);
  });

  it('rejects malformed packets', () => {
    expect(parseSpeechEngineServerEvent('not json')).toBeNull();
    expect(
      parseSpeechEngineServerEvent(
        JSON.stringify({ v: 2, type: 'error', data: {} }),
      ),
    ).toBeNull();
    // turnId is required on response.* / turn.started.
    expect(
      parseSpeechEngineClientEvent(
        JSON.stringify({
          v: 1,
          id: 'x',
          seq: 1,
          type: 'response.delta',
          data: { text: 'a' },
        }),
      ),
    ).toBeNull();
    expect(
      parseSpeechEngineClientEvent(
        JSON.stringify({
          v: 1,
          id: 'x',
          seq: 1,
          type: 'turn.started',
          data: {},
        }),
      ),
    ).toBeNull();
  });
});

class FakeSocket implements SpeechEngineWebSocketLike {
  readonly sent: string[] = [];
  readonly #handlers = new Map<string, ((...args: never[]) => void)[]>();

  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.#fire('close');
  }
  on(event: string, listener: (...args: never[]) => void): void {
    const list = this.#handlers.get(event) ?? [];
    list.push(listener);
    this.#handlers.set(event, list);
  }
  receive(packet: string): void {
    this.#fire('message', packet as never);
  }
  #fire(event: string, ...args: never[]): void {
    for (const listener of this.#handlers.get(event) ?? []) listener(...args);
  }
  events(): Array<{ type: string; data: Record<string, unknown> }> {
    return this.sent.map(raw => JSON.parse(raw));
  }
}

function opened(
  socket: FakeSocket,
  capabilities?: Record<string, boolean>,
): void {
  socket.receive(
    encodeSpeechEngineEvent(0, {
      type: 'session.opened',
      data: {
        sessionId: 's1',
        engine: {
          provider: 'openai',
          model: 'gpt-realtime-2',
          protocol: 'openai',
          capabilities: {
            'input.transcript.final': true,
            'input.transcript.partial': false,
            'input.speech.started': true,
            'input.interrupted': true,
            'output.audio': true,
            'output.cancel': true,
            'output.exactReadout': false,
            ...capabilities,
          },
        },
      },
    }),
  );
}

function transcript(socket: FakeSocket, text: string, itemId: string): void {
  socket.receive(
    encodeSpeechEngineEvent(0, {
      type: 'input.transcript.final',
      data: { text, itemId },
    }),
  );
}

describe('GatewaySpeechEngineSession', () => {
  it('surfaces transcripts and streams a reply with a consistent turnId', async () => {
    const socket = new FakeSocket();
    const session = new GatewaySpeechEngineSession(socket);
    session.ready();

    const transcripts: string[] = [];
    session.on('transcript', text => transcripts.push(text));

    opened(socket);
    transcript(socket, 'what is the weather', 'item_1');
    expect(transcripts).toEqual(['what is the weather']);

    await session.sendResponse('Sunny.');

    const types = socket.events().map(e => e.type);
    expect(types).toEqual([
      'session.ready',
      'turn.started',
      'response.delta',
      'response.done',
    ]);
    const turnIds = socket
      .events()
      .filter(e => e.type !== 'session.ready')
      .map(e => e.data.turnId);
    expect(new Set(turnIds).size).toBe(1);
  });

  it('extracts text from LLM stream chunks', async () => {
    const socket = new FakeSocket();
    const session = new GatewaySpeechEngineSession(socket);
    opened(socket);
    transcript(socket, 'hi', 'item_1');

    async function* stream() {
      yield { type: 'response.output_text.delta', delta: 'He' };
      yield { type: 'response.output_text.delta', delta: 'llo' };
    }
    await session.sendResponse(stream());

    const deltas = socket
      .events()
      .filter(e => e.type === 'response.delta')
      .map(e => e.data.text);
    expect(deltas).toEqual(['He', 'llo']);
  });

  it('supersedes the prior turn on a new transcript: aborts its signal and cancels by id', async () => {
    const socket = new FakeSocket();
    const session = new GatewaySpeechEngineSession(socket);
    opened(socket);

    let firstSignal: AbortSignal | undefined;
    session.on('transcript', (_text, ctx) => {
      firstSignal ??= ctx.signal;
    });

    transcript(socket, 'first', 'item_1');
    await session.sendResponse('first reply');
    transcript(socket, 'second', 'item_2');

    expect(firstSignal?.aborted).toBe(true);
    const cancel = socket.events().find(e => e.type === 'response.cancel');
    expect(cancel?.data.turnId).toBe('turn_1');
  });

  it('does not emit response.cancel when the engine lacks output.cancel', async () => {
    const socket = new FakeSocket();
    const session = new GatewaySpeechEngineSession(socket);
    opened(socket, { 'output.cancel': false });

    session.on('transcript', () => {});
    transcript(socket, 'first', 'item_1');
    await session.sendResponse('first reply');
    transcript(socket, 'second', 'item_2');

    expect(socket.events().some(e => e.type === 'response.cancel')).toBe(false);
  });
});
