import { createMistral } from '@ai-sdk/mistral';
import { streamText } from 'ai';

type RequestBody = {
  model?: string;
  reasoning_effort?: string;
};

type Observation = {
  scenario: string;
  reasoningChars: number;
  requestReasoningEffort: string | undefined;
  warnings: unknown;
};

async function main() {
  const requestBodies: RequestBody[] = [];
  const mistral = createMistral({
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        requestBodies.push(JSON.parse(init.body) as RequestBody);
      }
      return globalThis.fetch(input, init);
    },
  });

  const observations: Observation[] = [];

  for (const modelId of ['mistral-large-4', 'mistral-large-4-0'] as const) {
    for (const configuration of ['provider-option', 'top-level'] as const) {
      const result = streamText({
        model: mistral(modelId),
        prompt: 'How many r are in "strawberry"? Be brief.',
        maxOutputTokens: 300,
        ...(configuration === 'provider-option'
          ? {
              providerOptions: {
                mistral: { reasoningEffort: 'high' as const },
              },
            }
          : { reasoning: 'high' as const }),
      });

      let reasoningChars = 0;
      for await (const part of result.fullStream) {
        if (part.type === 'reasoning-delta') {
          reasoningChars += part.text.length;
        }
      }

      const requestBody = requestBodies.at(-1);
      observations.push({
        scenario: `${modelId}/${configuration}`,
        reasoningChars,
        requestReasoningEffort: requestBody?.reasoning_effort,
        warnings: await result.warnings,
      });
    }
  }

  console.log(JSON.stringify(observations, null, 2));

  const missingReasoning = observations
    .filter(observation => observation.reasoningChars === 0)
    .map(observation => observation.scenario);

  if (missingReasoning.length > 0) {
    throw new Error(
      `ISSUE #22183 REPRODUCED: reasoning configuration produced no reasoning-delta text for ${missingReasoning.join(', ')}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
