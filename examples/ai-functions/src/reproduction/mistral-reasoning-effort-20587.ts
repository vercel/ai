import { createMistral } from '@ai-sdk/mistral';
import { streamText } from 'ai';
import assert from 'node:assert/strict';

const scenarios = [
  { modelId: 'mistral-medium-3.5', configuration: 'reasoning' },
  { modelId: 'mistral-medium-3-5', configuration: 'reasoning' },
  { modelId: 'zai-glm-5-2', configuration: 'reasoning' },
  { modelId: 'mistral-medium-3-5', configuration: 'providerOptions' },
  { modelId: 'zai-glm-5-2', configuration: 'providerOptions' },
] as const;

async function main() {
  for (const scenario of scenarios) {
    let requestBody: Record<string, unknown> | undefined;
    const mistral = createMistral({
      fetch: async (input, init) => {
        requestBody = JSON.parse(init?.body as string);
        return globalThis.fetch(input, init);
      },
    });

    const result = streamText({
      model: mistral(scenario.modelId),
      messages: [{ role: 'user', content: 'What is 17*23? Be brief.' }],
      ...(scenario.configuration === 'reasoning'
        ? { reasoning: 'high' as const }
        : {
            providerOptions: {
              mistral: { reasoningEffort: 'high' as const },
            },
          }),
      maxOutputTokens: 400,
    });

    let reasoningChars = 0;
    for await (const part of result.fullStream) {
      if (part.type === 'reasoning-delta') {
        reasoningChars += part.text.length;
      }
    }

    const warnings = (await result.warnings) ?? [];
    console.log(
      scenario.modelId,
      scenario.configuration,
      'reasoningChars =',
      reasoningChars,
      'warnings =',
      warnings,
    );

    assert.equal(
      requestBody?.reasoning_effort,
      'high',
      `${scenario.modelId} ${scenario.configuration}: AI SDK dropped reasoning_effort`,
    );
    assert.equal(
      warnings.some(
        warning =>
          warning.type === 'unsupported' && warning.feature === 'reasoning',
      ),
      false,
      `${scenario.modelId} ${scenario.configuration}: AI SDK reported reasoning as unsupported`,
    );
    assert.ok(
      reasoningChars > 0,
      `${scenario.modelId} ${scenario.configuration}: provider returned no reasoning output`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
