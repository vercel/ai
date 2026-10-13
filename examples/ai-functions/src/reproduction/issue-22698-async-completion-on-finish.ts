import assert from 'node:assert/strict';
import { callCompletionApi } from 'ai';

async function main() {
  const failure = new Error('Could not persist completion');
  const completionUpdates: string[] = [];
  const storedErrors: Array<Error | undefined> = [];
  const reportedErrors: Error[] = [];
  const unhandledRejections: unknown[] = [];
  let finishArguments:
    | {
        prompt: string;
        completion: string;
      }
    | undefined;

  const onUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason);
  };

  process.on('unhandledRejection', onUnhandledRejection);

  try {
    await callCompletionApi({
      api: 'https://example.invalid',
      prompt: 'hello',
      credentials: undefined,
      headers: undefined,
      body: {},
      streamProtocol: 'text',
      setCompletion(completion) {
        completionUpdates.push(completion);
      },
      setLoading() {},
      setAbortController() {},
      setError(error) {
        storedErrors.push(error);
      },
      onError(error) {
        reportedErrors.push(error);
      },
      async onFinish(prompt, completion) {
        finishArguments = { prompt, completion };
        throw failure;
      },
      fetch: async () => new Response('answer'),
    });

    // Give Node.js an event-loop turn to emit an unhandledRejection.
    await new Promise<void>(resolve => setImmediate(resolve));
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }

  const observedReportedBug =
    unhandledRejections.length === 1 &&
    unhandledRejections[0] === failure &&
    reportedErrors.length === 0 &&
    storedErrors.length === 1 &&
    storedErrors[0] === undefined;

  try {
    assert.deepEqual(completionUpdates, ['', 'answer']);
    assert.deepEqual(finishArguments, {
      prompt: 'hello',
      completion: 'answer',
    });
    assert.deepEqual(
      unhandledRejections,
      [],
      'onFinish rejection must not become an unhandled rejection',
    );
    assert.deepEqual(
      reportedErrors,
      [failure],
      'onFinish rejection must be routed to onError',
    );
    assert.deepEqual(
      storedErrors,
      [undefined, failure],
      'onFinish rejection must be routed to setError',
    );
  } catch (error) {
    if (observedReportedBug) {
      console.error(
        'ISSUE_22698_REPRODUCED: async onFinish rejection was unhandled and bypassed onError/setError',
      );
    }
    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
