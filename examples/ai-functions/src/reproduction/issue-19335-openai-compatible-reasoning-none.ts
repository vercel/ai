import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

const failureSignal =
  "Issue #19335 reproduced: top-level reasoning 'none' was omitted from the OpenAI-compatible request body.";

async function main() {
  let requestBody: Record<string, unknown> | undefined;

  const provider = createOpenAICompatible({
    baseURL: 'https://example.invalid/v1',
    apiKey: 'dummy',
    name: 'custom',
    fetch: async (_input, init) => {
      if (typeof init?.body !== 'string') {
        throw new Error(
          'Reproduction harness did not receive a JSON request body.',
        );
      }

      requestBody = JSON.parse(init.body) as Record<string, unknown>;

      return new Response(
        JSON.stringify({
          id: 'chatcmpl-issue-19335',
          created: 1,
          model: 'qwen/qwen3.5-9b',
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'hi',
              },
              finish_reason: 'stop',
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
      );
    },
  });

  const result = await generateText({
    model: provider('qwen/qwen3.5-9b'),
    prompt: 'hi',
    reasoning: 'none',
    maxRetries: 0,
  });

  if (requestBody == null) {
    throw new Error('Reproduction harness did not capture a provider request.');
  }

  console.log(
    JSON.stringify(
      {
        requestBody,
        responseText: result.text,
        warnings: result.warnings,
        expectedReasoningEffort: 'none',
      },
      null,
      2,
    ),
  );

  if (requestBody.reasoning_effort !== 'none') {
    throw new Error(failureSignal);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
