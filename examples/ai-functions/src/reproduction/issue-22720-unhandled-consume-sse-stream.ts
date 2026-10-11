import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import {
  createUIMessageStreamResponse,
  pipeUIMessageStreamToResponse,
  type UIMessageChunk,
} from 'ai';

const CREATE_ERROR = 'create response background persistence failed';
const PIPE_ERROR = 'pipe response background persistence failed';
const FAILURE_SIGNAL =
  'ISSUE_22720_REPRODUCED: consumeSseStream rejections became unhandled after client responses completed';

class MockServerResponse extends EventEmitter {
  readonly chunks: Uint8Array[] = [];
  writableFinished = false;
  destroyed = false;

  setHeaders(): void {}

  writeHead(): this {
    return this;
  }

  write(chunk: Uint8Array): boolean {
    this.chunks.push(chunk);
    return true;
  }

  end(): void {
    this.writableFinished = true;
  }

  get body(): string {
    const decoder = new TextDecoder();
    return this.chunks.map(chunk => decoder.decode(chunk)).join('');
  }
}

function createMessageStream(): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: 'start', messageId: 'message-1' });
      controller.enqueue({ type: 'finish' });
      controller.close();
    },
  });
}

async function captureUnhandledRejections(
  run: () => Promise<boolean>,
): Promise<{ responseCompleted: boolean; unhandled: string[] }> {
  const unhandled: unknown[] = [];
  const listener = (error: unknown) => unhandled.push(error);
  process.on('unhandledRejection', listener);

  try {
    const responseCompleted = await run();
    await new Promise(resolve => setImmediate(resolve));

    return {
      responseCompleted,
      unhandled: unhandled.map(error =>
        error instanceof Error ? error.message : String(error),
      ),
    };
  } finally {
    process.off('unhandledRejection', listener);
  }
}

async function main(): Promise<void> {
  const createResult = await captureUnhandledRejections(async () => {
    const response = createUIMessageStreamResponse({
      stream: createMessageStream(),
      async consumeSseStream() {
        throw new Error(CREATE_ERROR);
      },
    });

    return (await response.text()).includes('[DONE]');
  });

  const pipeResult = await captureUnhandledRejections(async () => {
    const response = new MockServerResponse();

    await pipeUIMessageStreamToResponse({
      response: response as unknown as ServerResponse,
      stream: createMessageStream(),
      async consumeSseStream() {
        throw new Error(PIPE_ERROR);
      },
    });

    return response.body.includes('[DONE]');
  });

  console.log(JSON.stringify({ createResult, pipeResult }, null, 2));

  assert.equal(
    createResult.responseCompleted,
    true,
    'createUIMessageStreamResponse should complete the client response',
  );
  assert.equal(
    pipeResult.responseCompleted,
    true,
    'pipeUIMessageStreamToResponse should complete the client response',
  );

  const callbackRejections = [
    ...createResult.unhandled,
    ...pipeResult.unhandled,
  ].filter(message => message === CREATE_ERROR || message === PIPE_ERROR);

  if (callbackRejections.length > 0) {
    throw new Error(`${FAILURE_SIGNAL}: ${callbackRejections.join(', ')}`);
  }

  assert.deepEqual(
    [...createResult.unhandled, ...pipeResult.unhandled],
    [],
    'No unrelated unhandled rejections should occur',
  );
}

main();
