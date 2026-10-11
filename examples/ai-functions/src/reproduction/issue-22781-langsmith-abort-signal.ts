import assert from 'node:assert/strict';
import { LangSmithDeploymentTransport } from '@ai-sdk/langchain';

async function main() {
  const controller = new AbortController();
  const abortReason = new Error('user stopped');

  let markStreamStarted: () => void;
  const streamStarted = new Promise<void>(resolve => {
    markStreamStarted = resolve;
  });

  let receivedSignal: AbortSignal | undefined;
  const graph = {
    async stream(
      _input: unknown,
      options: { signal?: AbortSignal; streamMode: string[] },
    ): Promise<AsyncIterable<unknown>> {
      receivedSignal = options.signal;
      markStreamStarted();

      return new Promise((_, reject) => {
        if (options.signal?.aborted) {
          reject(options.signal.reason);
          return;
        }

        options.signal?.addEventListener(
          'abort',
          () => reject(options.signal?.reason),
          { once: true },
        );
      });
    },
  };

  const transport = new LangSmithDeploymentTransport({
    url: 'https://example.invalid',
  });

  (
    transport as unknown as {
      graph: typeof graph;
    }
  ).graph = graph;

  const sendResult = transport.sendMessages({
    trigger: 'submit-message',
    chatId: 'chat1',
    messageId: undefined,
    messages: [
      {
        id: 'user1',
        role: 'user',
        parts: [{ type: 'text', text: 'hello' }],
      },
    ],
    abortSignal: controller.signal,
  });

  await streamStarted;
  controller.abort(abortReason);

  let timeout: NodeJS.Timeout | undefined;
  const outcome = await Promise.race([
    sendResult.then(
      () => ({ type: 'resolved' as const }),
      error => ({ type: 'rejected' as const, error }),
    ),
    new Promise<{ type: 'timed-out' }>(resolve => {
      timeout = setTimeout(() => resolve({ type: 'timed-out' }), 200);
    }),
  ]);
  clearTimeout(timeout);

  assert.notEqual(
    outcome.type,
    'timed-out',
    'ISSUE #22781 reproduced: aborting sendMessages does not cancel the pending RemoteGraph.stream request',
  );
  assert.equal(outcome.type, 'rejected');
  assert.equal(outcome.error, abortReason);

  console.log({
    cancellationReachedRemoteGraph: true,
    forwardedSignalIdentity: receivedSignal === controller.signal,
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
