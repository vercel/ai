import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { readFile } from 'node:fs/promises';

const modelIds = ['gpt-6-sol', 'gpt-6-luna'] as const;

async function main() {
  const failures: string[] = [];

  for (const modelId of modelIds) {
    const fixture = JSON.parse(
      await readFile(
        new URL(
          `../../../../packages/openai/src/responses/__fixtures__/${modelId}-reasoning-none-sampling.json`,
          import.meta.url,
        ),
        'utf8',
      ),
    );

    let requestBody: Record<string, unknown> | undefined;
    const provider = createOpenAI({
      apiKey: 'test-key',
      fetch: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    const result = await generateText({
      model: provider.responses(modelId),
      temperature: 0,
      topP: 0.9,
      providerOptions: {
        openai: {
          reasoningEffort: 'none',
          store: false,
        },
      },
      maxOutputTokens: 32,
      maxRetries: 0,
      prompt: 'Reply with the single word: ok',
    });

    const samplingWarnings = (result.warnings ?? []).filter(
      warning =>
        warning.type === 'unsupported' &&
        (warning.feature === 'temperature' || warning.feature === 'topP'),
    );

    if (
      requestBody?.temperature !== 0 ||
      requestBody?.top_p !== 0.9 ||
      samplingWarnings.length !== 0
    ) {
      failures.push(modelId);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `ISSUE_22302: reasoningEffort "none" stripped temperature/topP or emitted unsupported warnings for ${failures.join(', ')}`,
    );
  }

  console.log(
    'GPT-6 Sol and Luna preserved temperature/topP without unsupported warnings.',
  );
}

main();
