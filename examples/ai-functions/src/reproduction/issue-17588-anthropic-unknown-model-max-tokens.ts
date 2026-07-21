import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

const modelId = 'claude-mythos-5';
const requestBodies: Array<Record<string, unknown>> = [];

const anthropic = createAnthropic({
  apiKey: 'test-key',
  fetch: async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)));

    return new Response(
      JSON.stringify({
        id: 'msg_issue_17588',
        type: 'message',
        role: 'assistant',
        model: modelId,
        content: [{ type: 'text', text: 'OK' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 1,
          output_tokens: 1,
        },
      }),
      {
        headers: { 'content-type': 'application/json' },
        status: 200,
      },
    );
  },
});

async function main() {
  const implicitResult = await generateText({
    model: anthropic(modelId),
    prompt: 'Reply with exactly OK.',
    maxRetries: 0,
  });

  const explicitResult = await generateText({
    model: anthropic(modelId),
    prompt: 'Reply with exactly OK.',
    maxOutputTokens: 128_000,
    maxRetries: 0,
  });

  const implicitMaxTokens = requestBodies[0]?.max_tokens;
  const explicitMaxTokens = requestBodies[1]?.max_tokens;
  const implicitWarnings = implicitResult.warnings ?? [];
  const explicitWarnings = explicitResult.warnings ?? [];

  console.log(
    JSON.stringify(
      {
        modelId,
        implicitMaxTokens,
        implicitWarnings,
        explicitMaxTokens,
        explicitWarnings,
      },
      null,
      2,
    ),
  );

  if (explicitMaxTokens !== 128_000) {
    throw new Error(
      `Comparison failed: explicit maxOutputTokens became ${String(explicitMaxTokens)}`,
    );
  }

  if (implicitMaxTokens === 4096 && implicitWarnings.length === 0) {
    throw new Error(
      'ISSUE_17588_REPRODUCED: unknown model silently received max_tokens=4096 with no warning',
    );
  }

  console.log(
    'Issue not reproduced: the unknown model was not silently capped at 4096.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
