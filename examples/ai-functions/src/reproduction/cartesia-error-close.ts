import { createCartesia } from '@ai-sdk/cartesia';
import assert from 'node:assert/strict';

const FAILURE_SIGNAL =
  'ISSUE_22958_REPRODUCED: abnormal WebSocket close was reported as a successful partial transcript';

type Outcome = {
  error?: string;
  finish?: string;
};

async function check({
  closeCode,
  closeReason = '',
  explicitDone = false,
}: {
  closeCode: number;
  closeReason?: string;
  explicitDone?: boolean;
}): Promise<Outcome> {
  class MockSocket {
    readyState = 0;
    bufferedAmount = 0;
    onopen: ((event: unknown) => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onclose: ((event: { code: number; reason: string }) => void) | null = null;

    constructor() {
      queueMicrotask(() => {
        this.readyState = 1;
        this.onopen?.({});
        this.onmessage?.({
          data: JSON.stringify({
            type: 'turn.end',
            transcript: 'First sentence.',
          }),
        });
        if (explicitDone) {
          this.onmessage?.({ data: JSON.stringify({ type: 'done' }) });
        }
        this.readyState = 3;
        this.onclose?.({ code: closeCode, reason: closeReason });
      });
    }

    send() {}

    close() {
      this.readyState = 3;
    }
  }

  const model = createCartesia({
    apiKey: 'synthetic',
    webSocket: MockSocket,
    fetch: async () => Response.json({ token: 'synthetic' }),
  }).transcription('ink-2');

  const parts = [];
  let error: unknown;
  try {
    const { stream } = await model.doStream!({
      audio: new ReadableStream(),
      inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
      providerOptions: {},
    });
    for await (const part of stream) {
      parts.push(part);
    }
  } catch (caught) {
    error = caught;
  }

  return {
    error: error instanceof Error ? error.message : undefined,
    finish: parts.find(part => part.type === 'finish')?.text,
  };
}

async function main() {
  const normal = await check({ closeCode: 1000 });
  const serverError = await check({
    closeCode: 1011,
    closeReason: 'backend failed',
  });
  const abnormalClosure = await check({ closeCode: 1006 });
  const doneThenClose = await check({
    closeCode: 1011,
    closeReason: 'late close after done',
    explicitDone: true,
  });

  console.log({ normal, serverError, abnormalClosure, doneThenClose });

  assert.deepEqual(normal, {
    error: undefined,
    finish: 'First sentence.',
  });
  assert.deepEqual(doneThenClose, {
    error: undefined,
    finish: 'First sentence.',
  });

  for (const { closeCode, outcome } of [
    { closeCode: 1011, outcome: serverError },
    { closeCode: 1006, outcome: abnormalClosure },
  ]) {
    if (outcome.error == null && outcome.finish === 'First sentence.') {
      throw new Error(`${FAILURE_SIGNAL} (close code ${closeCode})`);
    }
  }

  assert.ok(
    serverError.error,
    'close code 1011 must fail instead of returning a successful transcript',
  );
  assert.ok(
    abnormalClosure.error,
    'close code 1006 must fail instead of returning a successful transcript',
  );
}

await main();
