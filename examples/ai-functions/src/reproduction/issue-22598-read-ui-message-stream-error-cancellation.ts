import assert from 'node:assert/strict';
import { readUIMessageStream, type UIMessageChunk } from 'ai';

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (predicate()) {
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, 10));
  }

  return predicate();
}

async function verifyNonTerminatingModeContinues() {
  const upstream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({
        type: 'error',
        errorText: 'recoverable provider error',
      });
      controller.enqueue({ type: 'start', messageId: 'message-1' });
      controller.enqueue({ type: 'text-start', id: 'text-1' });
      controller.enqueue({
        type: 'text-delta',
        id: 'text-1',
        delta: 'continued',
      });
      controller.close();
    },
  });

  let finalText: string | undefined;

  for await (const message of readUIMessageStream({
    stream: upstream,
    terminateOnError: false,
  })) {
    finalText = message.parts.find(part => part.type === 'text')?.text;
  }

  assert.equal(
    finalText,
    'continued',
    'terminateOnError: false should continue after an error chunk',
  );
}

async function verifyTerminatingModeCancels() {
  let cancelCount = 0;
  let upstreamController:
    | ReadableStreamDefaultController<UIMessageChunk>
    | undefined;

  const upstream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      upstreamController = controller;
      controller.enqueue({
        type: 'error',
        errorText: 'provider failed',
      });
    },
    cancel() {
      cancelCount++;
    },
  });

  const messages = readUIMessageStream({
    stream: upstream,
    terminateOnError: true,
  });

  await assert.rejects(
    async () => {
      for await (const message of messages) {
        void message;
      }
    },
    error => error instanceof Error && error.message === 'provider failed',
    'The output reader should preserve the protocol error',
  );

  const wasCancelled = await waitFor(() => cancelCount > 0, 250);
  const wasReleased = await waitFor(() => !upstream.locked, 250);

  if (!wasCancelled) {
    upstreamController?.close();
  }

  if (!wasCancelled || !wasReleased) {
    throw new Error(
      `ISSUE_22598_REPRODUCED: terminateOnError left the upstream stream running (cancelCount=${cancelCount}, locked=${upstream.locked})`,
    );
  }

  assert.equal(
    cancelCount,
    1,
    'terminateOnError should cancel the upstream exactly once',
  );
}

async function main() {
  await verifyNonTerminatingModeContinues();
  await verifyTerminatingModeCancels();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
