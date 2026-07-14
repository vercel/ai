import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';

const expectedError = {
  message: 'Context length exceeded',
  code: 'CONTEXT_LENGTH_EXCEEDED',
};

async function main() {
  const provider = createOpenAICompatible({
    baseURL: 'https://proxy.example/v1',
    name: 'issue-13506-proxy',
    fetch: async () =>
      new Response(
        [
          `data: ${JSON.stringify({ error: expectedError })}`,
          '',
          'data: [DONE]',
          '',
        ].join('\n'),
        {
          headers: {
            'content-type': 'text/event-stream',
          },
        },
      ),
  });

  const result = streamText({
    model: provider.chatModel('gpt-4'),
    prompt: 'Hello',
    maxRetries: 0,
  });

  let observedError: unknown;

  for await (const part of result.fullStream) {
    if (part.type === 'error') {
      observedError = part.error;
      break;
    }
  }

  console.log(
    JSON.stringify(
      {
        expectedError,
        observedError,
      },
      null,
      2,
    ),
  );

  if (
    typeof observedError !== 'object' ||
    observedError == null ||
    !('code' in observedError) ||
    observedError.code !== expectedError.code
  ) {
    throw new Error(
      `Reproduced issue #13506: fullStream exposed ${JSON.stringify(observedError)} instead of preserving SSE error code ${expectedError.code}.`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
