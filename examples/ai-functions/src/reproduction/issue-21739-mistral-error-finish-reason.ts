import { createMistral } from '@ai-sdk/mistral';
import { generateText } from 'ai';
import { readFile } from 'node:fs/promises';

async function main() {
  const fixture = await readFile(
    new URL(
      '../../../../packages/mistral/src/__fixtures__/mistral-error-finish-reason.json',
      import.meta.url,
    ),
    'utf8',
  );

  const mistral = createMistral({
    apiKey: 'reproduction-api-key',
    fetch: async () =>
      new Response(fixture, {
        headers: { 'content-type': 'application/json' },
      }),
  });

  const result = await generateText({
    model: mistral('mistral-small-latest'),
    prompt: 'Hello',
  });

  if (result.rawFinishReason !== 'error') {
    throw new Error(
      `Fixture precondition failed: expected rawFinishReason "error", received ${JSON.stringify(result.rawFinishReason)}`,
    );
  }

  if (result.finishReason !== 'error') {
    throw new Error(
      `ISSUE_21739: expected finishReason "error", received "${result.finishReason}" while rawFinishReason was "error"`,
    );
  }

  console.log(
    'Issue 21739 is fixed: Mistral finish_reason "error" maps to unified "error".',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
