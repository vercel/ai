import { createOpenAI } from '@ai-sdk/openai';
import { APICallError, streamText } from 'ai';

const sse =
  'event: error\n' +
  'data: {"type":"error","sequence_number":0,"error":{"type":"insufficient_quota","code":"credit_balance_exhausted","message":"You have no credits remaining.","param":null}}\n\n';

async function main() {
  let calls = 0;

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

  if (calls !== 1) {
    throw new Error(
      `Issue #21345 reproduced: insufficient_quota was retried; expected 1 fetch call, observed ${calls}`,
    );
  }

  if (!APICallError.isInstance(observedError)) {
    const errorName =
      observedError instanceof Error
        ? observedError.constructor.name
        : typeof observedError;
    throw new Error(
      `Expected APICallError after one request, observed ${errorName}`,
    );
  }

  if (observedError.isRetryable !== false) {
    throw new Error(
      `Expected isRetryable=false, observed ${String(observedError.isRetryable)}`,
    );
  }

  console.log(
    'Issue #21345 not reproduced: fetch calls=1; error=APICallError; isRetryable=false',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
