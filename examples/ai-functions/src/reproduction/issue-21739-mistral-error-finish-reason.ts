import { createMistral } from '@ai-sdk/mistral';
import { generateText } from 'ai';
import assert from 'node:assert/strict';

const rawFinishReason = 'error';
const expectedFinishReason = 'error';

async function main() {
  const mistral = createMistral({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(
        JSON.stringify({
          id: 'mistral-error-finish-reason',
          object: 'chat.completion',
          created: 1,
          model: 'mistral-small-latest',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Partial response before the provider error.',
                tool_calls: null,
              },
              finish_reason: rawFinishReason,
            },
          ],
          usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
  });

  const result = await generateText({
    model: mistral('mistral-small-latest'),
    prompt: 'Hello',
  });

  assert.equal(
    result.rawFinishReason,
    rawFinishReason,
    'Mistral raw finish reason was not preserved',
  );

  if (result.finishReason !== expectedFinishReason) {
    console.error(
      `ISSUE_21739: finishReason was "${result.finishReason}"; expected "error" for rawFinishReason "error"`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('Issue #21739 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
