import assert from 'node:assert/strict';
import {
  Experimental_AbstractRealtimeSession,
  type Experimental_RealtimeModel,
  type Experimental_RealtimeState,
} from 'ai';

class Session extends Experimental_AbstractRealtimeSession {
  protected setState<K extends keyof Experimental_RealtimeState>(
    key: K,
    value: Experimental_RealtimeState[K],
  ): void {
    this.state = { ...this.state, [key]: value };
  }

  get messages() {
    return this.state.messages;
  }

  override async sendEvent(): Promise<void> {
    // Mock the transport boundary; this reproduction only exercises the public
    // text-message helper and its local state update.
  }
}

async function main() {
  const model = {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock',
  } as Experimental_RealtimeModel;
  const session = new Session({
    model,
    api: { websocket: 'ws://localhost/mock' },
  });

  const originalDateNow = Date.now;
  Date.now = () => 1_700_000_000_000;
  try {
    session.sendTextMessage('first');
    session.sendTextMessage('second');
  } finally {
    Date.now = originalDateNow;
  }

  assert.equal(session.messages.length, 2, 'both messages must be preserved');
  assert.deepEqual(
    session.messages.map(message => message.parts),
    [
      [{ type: 'text', text: 'first', state: 'done' }],
      [{ type: 'text', text: 'second', state: 'done' }],
    ],
    'messages must preserve submission order and content',
  );

  const ids = session.messages.map(message => message.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error(
      `ISSUE #22591 reproduced: distinct text messages received duplicate IDs: ${JSON.stringify(ids)}`,
    );
  }

  console.log('Distinct text messages received unique IDs:', ids);
}

await main();
