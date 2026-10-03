import 'dotenv/config';
import { createAnthropic } from '@ai-sdk/anthropic';
import { APICallError, generateText, type ModelMessage } from 'ai';

const rejection =
  "Input tag 'fallback' found using 'type' does not match any of the expected tags";
const failureSignal =
  'ISSUE_22005_REPRODUCED: replayed anthropic.fallback was rejected without the server-side-fallback beta';

async function main() {
  const anthropic = createAnthropic();
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'question' }],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'custom',
          kind: 'anthropic.fallback',
          providerOptions: {
            anthropic: {
              type: 'fallback',
              from: { model: 'claude-opus-5-5' },
              to: { model: 'claude-opus-4-8' },
            },
          },
        },
        { type: 'text', text: 'the answer' },
      ],
    },
    {
      role: 'user',
      content: [{ type: 'text', text: 'Reply with OK only.' }],
    },
  ];
  const rejectedModels: string[] = [];

  for (const modelId of ['claude-opus-4-8', 'claude-opus-5-5'] as const) {
    try {
      await generateText({
        model: anthropic(modelId),
        messages,
        maxOutputTokens: 16,
      });
    } catch (error) {
      if (
        APICallError.isInstance(error) &&
        error.statusCode === 400 &&
        error.responseBody?.includes(rejection)
      ) {
        rejectedModels.push(modelId);
        continue;
      }

      throw error;
    }
  }

  if (rejectedModels.length > 0) {
    console.error(`${failureSignal}: ${rejectedModels.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue #22005 did not reproduce: Anthropic accepted the replayed fallback block.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
