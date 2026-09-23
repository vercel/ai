import { createOpenAI } from '@ai-sdk/openai';
import { APICallError, TypeValidationError } from 'ai';
import { readFile } from 'node:fs/promises';

const FAILURE_SIGNAL =
  'ISSUE_21360_REPRODUCED: doStream resolved and emitted AI_TypeValidationError instead of rejecting with retryable APICallError';

async function main() {
  const fixture = (
    await readFile(
      new URL(
        '../../../../packages/openai/src/responses/__fixtures__/openai-error-null-code.1.chunks.txt',
        import.meta.url,
      ),
      'utf8',
    )
  ).trim();
  const frame = JSON.parse(fixture);

  const openai = createOpenAI({
    apiKey: 'test',
    fetch: async () =>
      new Response(`data: ${fixture}\n\ndata: [DONE]\n\n`, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
  });

  let result;
  try {
    result = await openai.responses('gpt-5').doStream({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'hello' }],
        },
      ],
    });
  } catch (error) {
    if (
      APICallError.isInstance(error) &&
      error.statusCode === 500 &&
      error.isRetryable === true
    ) {
      console.log(
        'Expected behavior observed: doStream rejected with retryable APICallError status 500.',
      );
      return;
    }

    throw new Error('Unexpected doStream rejection.', { cause: error });
  }

  const parts = [];
  const reader = result.stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parts.push(value);
  }

  const errorPart = parts.find(part => part.type === 'error');
  if (
    errorPart?.type === 'error' &&
    TypeValidationError.isInstance(errorPart.error)
  ) {
    const finishPart = parts.find(part => part.type === 'finish');
    if (
      JSON.stringify(errorPart.error.value) !== JSON.stringify(frame) ||
      'statusCode' in errorPart.error ||
      'isRetryable' in errorPart.error ||
      finishPart?.type !== 'finish' ||
      finishPart.finishReason.unified !== 'error'
    ) {
      throw new Error(
        `Unexpected validation-error stream details: ${JSON.stringify({
          value: errorPart.error.value,
          hasStatusCode: 'statusCode' in errorPart.error,
          hasIsRetryable: 'isRetryable' in errorPart.error,
          finishReason:
            finishPart?.type === 'finish' ? finishPart.finishReason : undefined,
        })}`,
      );
    }

    throw new Error(FAILURE_SIGNAL);
  }

  throw new Error(
    `Unexpected resolved stream result: ${JSON.stringify(
      parts.map(part =>
        part.type === 'error'
          ? {
              type: part.type,
              errorName:
                part.error instanceof Error ? part.error.name : undefined,
            }
          : { type: part.type },
      ),
    )}`,
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
