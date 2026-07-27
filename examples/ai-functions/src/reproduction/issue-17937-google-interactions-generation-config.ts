import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModelV3Prompt, SharedV3Warning } from '@ai-sdk/provider';
import * as fs from 'node:fs';
import * as path from 'node:path';

const prompt: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello, how are you?' }] },
];

const settings = {
  prompt,
  temperature: 0.5,
  topK: 10,
  presencePenalty: 0.5,
  frequencyPenalty: 0.5,
} as const;

function warningMentions(
  warnings: Array<SharedV3Warning>,
  feature: string,
): boolean {
  return JSON.stringify(warnings).includes(feature);
}

async function main() {
  const interactionFixture = JSON.parse(
    fs.readFileSync(
      path.resolve(
        process.cwd(),
        '../../packages/google/src/interactions/__fixtures__/issue-17937-top-k.json',
      ),
      'utf8',
    ),
  );
  const calls: Array<{ url: string; body: Record<string, any> }> = [];

  const provider = createGoogleGenerativeAI({
    apiKey: 'test-api-key',
    generateId: () => 'test-id',
    fetch: async (input, init) => {
      const url = String(input);
      calls.push({
        url,
        body: JSON.parse(String(init?.body)),
      });

      const responseBody = url.endsWith('/interactions')
        ? interactionFixture
        : {
            candidates: [
              {
                content: {
                  parts: [{ text: 'standard model response' }],
                  role: 'model',
                },
                finishReason: 'STOP',
                index: 0,
              },
            ],
            usageMetadata: {
              promptTokenCount: 7,
              candidatesTokenCount: 3,
              totalTokenCount: 10,
            },
            modelVersion: 'gemini-2.5-flash',
            responseId: 'test-response-id',
          };

      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const standardResult =
    await provider('gemini-2.5-flash').doGenerate(settings);
  const standardBody = calls.at(-1)?.body;

  const interactionsResult = await provider
    .interactions('gemini-2.5-flash')
    .doGenerate(settings);
  const interactionsBody = calls.at(-1)?.body;

  const agentResult = await provider
    .interactions({ agent: 'deep-research-pro-preview-12-2025' })
    .doGenerate(settings);
  const agentBody = calls.at(-1)?.body;

  const observed = {
    standard: {
      generationConfig: standardBody?.generationConfig,
      warnings: standardResult.warnings,
    },
    interactionsModel: {
      generationConfig: interactionsBody?.generation_config,
      warnings: interactionsResult.warnings,
    },
    interactionsAgent: {
      generationConfig: agentBody?.generation_config,
      warnings: agentResult.warnings,
    },
  };

  console.log(JSON.stringify(observed, null, 2));

  const standardForwardsAll =
    standardBody?.generationConfig?.topK === 10 &&
    standardBody?.generationConfig?.presencePenalty === 0.5 &&
    standardBody?.generationConfig?.frequencyPenalty === 0.5;
  const interactionsModelHandlesAll =
    interactionsBody?.generation_config?.top_k === 10 &&
    warningMentions(interactionsResult.warnings, 'presencePenalty') &&
    warningMentions(interactionsResult.warnings, 'frequencyPenalty');
  const interactionsAgentWarnsForAll =
    warningMentions(agentResult.warnings, 'topK') &&
    warningMentions(agentResult.warnings, 'presencePenalty') &&
    warningMentions(agentResult.warnings, 'frequencyPenalty');

  if (
    standardForwardsAll &&
    (!interactionsModelHandlesAll || !interactionsAgentWarnsForAll)
  ) {
    throw new Error(
      'Reproduced issue #17937: google.interactions() silently dropped topK, presencePenalty, and frequencyPenalty.',
    );
  }

  if (!standardForwardsAll) {
    throw new Error(
      'Comparison setup failed: the standard Google model did not forward all three options.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
