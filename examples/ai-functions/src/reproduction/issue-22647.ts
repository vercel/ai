import assert from 'node:assert/strict';
import { callCompletionApi } from 'ai';

async function runProtocol(streamProtocol: 'data' | 'text') {
  let cancelled = false;
  let caught: Error | undefined;
  let sent = false;
  const failure = new Error('consumer update failed');
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent) {
        return;
      }

      sent = true;
      const text =
        streamProtocol === 'text'
          ? 'hello'
          : `data: ${JSON.stringify({
              type: 'text-delta',
              id: 't',
              delta: 'hello',
            })}\n\n`;
      controller.enqueue(new TextEncoder().encode(text));
    },
    cancel() {
      cancelled = true;
    },
  });

  await callCompletionApi({
    api: 'https://example.invalid',
    prompt: 'hi',
    credentials: undefined,
    headers: undefined,
    body: {},
    streamProtocol,
    setCompletion(text) {
      if (text) {
        throw failure;
      }
    },
    setLoading() {},
    setError(error) {
      if (error) {
        caught = error;
      }
    },
    setAbortController() {},
    onFinish: undefined,
    onError: undefined,
    fetch: async () => new Response(body),
  });

  await new Promise(resolve => setTimeout(resolve, 0));

  return {
    streamProtocol,
    caught: caught === failure,
    cancelled,
  };
}

async function main() {
  const data = await runProtocol('data');
  const text = await runProtocol('text');

  console.log(JSON.stringify([data, text]));

  assert.equal(
    data.caught,
    true,
    'PRECONDITION: data completion callback failure must reach the error path',
  );
  assert.equal(
    data.cancelled,
    true,
    'PRECONDITION: data completion callback failure must cancel the response stream',
  );
  assert.equal(
    text.caught,
    true,
    'PRECONDITION: text completion callback failure must reach the error path',
  );
  assert.equal(
    text.cancelled,
    true,
    'ISSUE_22647: text completion callback failure did not cancel the response stream',
  );
}

main();
