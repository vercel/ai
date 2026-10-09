import { createOpenAI } from '@ai-sdk/openai';
import { TypeValidationError } from '@ai-sdk/provider';
import { streamText } from 'ai';
import { readFile } from 'node:fs/promises';

const failureSignal =
  'ISSUE_22409_REPRODUCED: null error.code was rejected as AI_TypeValidationError and the Responses request was not retried';

function eventStreamResponse(events: string[]) {
  return new Response(
    `${events.map(event => `data: ${event}\n\n`).join('')}data: [DONE]\n\n`,
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    },
  );
}

async function main() {
  const errorEvent = (
    await readFile(
      new URL(
        '../../../../packages/openai/src/responses/__fixtures__/openai-error-null-code.chunks.txt',
        import.meta.url,
      ),
      'utf8',
    )
  ).trim();

  let requestCount = 0;
  const openai = createOpenAI({
    apiKey: 'reproduction-api-key',
    fetch: async () => {
      requestCount++;

      if (requestCount === 1) {
        return eventStreamResponse([errorEvent]);
      }

      return new Response(
        JSON.stringify({
          error: {
            message: 'Intentional terminal response from retry attempt.',
            type: 'invalid_request_error',
            code: 'invalid_request_error',
            param: null,
          },
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  });

  const observedErrors: unknown[] = [];
  const result = streamText({
    model: openai.responses('gpt-5'),
    prompt: 'Hello',
    maxRetries: 1,
    onError: ({ error }) => {
      observedErrors.push(error);
    },
  });

  try {
    for await (const part of result.fullStream) {
      if (part.type === 'error') {
        observedErrors.push(part.error);
      }
    }
  } catch (error) {
    observedErrors.push(error);
  }

  if (requestCount === 2) {
    console.log(
      'Expected behavior observed: the retryable stream error triggered a second request.',
    );
    return;
  }

  if (
    requestCount === 1 &&
    observedErrors.some(error => TypeValidationError.isInstance(error))
  ) {
    throw new Error(failureSignal);
  }

  throw new Error(
    `Unexpected reproduction outcome: requestCount=${requestCount}, errors=${observedErrors
      .map(error =>
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error),
      )
      .join(' | ')}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
