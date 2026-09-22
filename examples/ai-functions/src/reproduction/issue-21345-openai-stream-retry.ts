import { createOpenAI } from '@ai-sdk/openai';
import { strict as assert } from 'node:assert';
import { APICallError, RetryError, streamText } from 'ai';

const sse =
  'event: error\n' +
  'data: {"type":"error","sequence_number":0,"error":{"type":"insufficient_quota","code":"credit_balance_exhausted","message":"You have no credits remaining.","param":null}}\n\n';

async function main() {
  let calls = 0;
  const startedAt = performance.now();

  const result = streamText({
    model: createOpenAI({
      apiKey: 'test',
      fetch: async () => {
        calls++;
        return new Response(sse, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      },
    })('gpt-6-sol'),
    prompt: 'hi',
    onError: () => {},
  });

  let observedError: unknown;
  for await (const part of result.fullStream) {
    if (part.type === 'error') {
      observedError = part.error;
    }
  }

  const elapsedMs = Math.round(performance.now() - startedAt);

  if (
    calls === 3 &&
    RetryError.isInstance(observedError) &&
    observedError.message.includes(
      'Failed after 3 attempts. Last error: You have no credits remaining.',
    )
  ) {
    throw new Error(
      `ISSUE_21345_REPRODUCED: insufficient_quota was retried 3 times and surfaced RetryError after ${elapsedMs}ms`,
    );
  }

  assert.equal(calls, 1, 'insufficient_quota must not be retried');
  assert.ok(
    APICallError.isInstance(observedError),
    'the first insufficient_quota event must surface as APICallError',
  );
  assert.equal(observedError.statusCode, 429);
  assert.equal(observedError.isRetryable, false);

  console.log(
    `Issue #21345 not reproduced: one non-retryable APICallError after ${elapsedMs}ms`,
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
