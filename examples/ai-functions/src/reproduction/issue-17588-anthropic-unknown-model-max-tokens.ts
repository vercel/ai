import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

const failureSignal =
  'ISSUE #17588 REPRODUCED: unknown Anthropic model silently received max_tokens=4096';

async function main() {
  let requestBody: { max_tokens?: number; model?: string } | undefined;

  const anthropic = createAnthropic({
    apiKey: 'reproduction-api-key',
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));

      return new Response(
        JSON.stringify({
          id: 'msg_reproduction',
          type: 'message',
          role: 'assistant',
          model: 'claude-future-6',
          content: [{ type: 'text', text: 'Synthetic successful response.' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: {
            input_tokens: 1,
            output_tokens: 4,
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
    model: anthropic('claude-future-6'),
    prompt: 'Generate a response that may require more than 4096 tokens.',
  });

  const warnings = result.warnings ?? [];
  const hasUnknownModelWarning = warnings.some(warning => {
    const warningText = JSON.stringify(warning).toLowerCase();
    return (
      warningText.includes('unknown') ||
      warningText.includes('max_tokens') ||
      warningText.includes('maxoutputtokens')
    );
  });

  if (requestBody?.max_tokens === 4096 && !hasUnknownModelWarning) {
    console.error(failureSignal);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Issue not reproduced: request=${JSON.stringify(requestBody)}, warnings=${JSON.stringify(warnings)}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
