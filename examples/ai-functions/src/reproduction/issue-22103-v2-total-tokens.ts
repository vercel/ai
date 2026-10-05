import type { LanguageModelV2, LanguageModelV2Usage } from '@ai-sdk/provider';
import { generateText } from 'ai';
import assert from 'node:assert/strict';

const providerReportedUsage: LanguageModelV2Usage = {
  inputTokens: 10,
  outputTokens: 5,
  totalTokens: 20,
  reasoningTokens: 5,
};

const legacyModel: LanguageModelV2 = {
  specificationVersion: 'v2',
  provider: 'reproduction',
  modelId: 'legacy-model',
  supportedUrls: {},
  doGenerate: async () => ({
    content: [{ type: 'text', text: 'ok' }],
    finishReason: 'stop',
    usage: providerReportedUsage,
    warnings: [],
  }),
  doStream: async () => {
    throw new Error('doStream is not used by this reproduction');
  },
};

async function main() {
  const result = await generateText({
    model: legacyModel,
    prompt: 'hello',
  });

  assert.equal(result.text, 'ok');
  assert.equal(result.usage.inputTokens, providerReportedUsage.inputTokens);
  assert.equal(result.usage.outputTokens, providerReportedUsage.outputTokens);
  assert.equal(
    result.usage.outputTokenDetails.reasoningTokens,
    providerReportedUsage.reasoningTokens,
  );

  console.log(
    JSON.stringify({
      providerReportedUsage,
      publicUsage: result.usage,
    }),
  );

  if (result.usage.raw?.totalTokens !== providerReportedUsage.totalTokens) {
    throw new Error(
      'REPRODUCED: V2 provider-reported totalTokens was dropped from public usage.raw',
    );
  }
}

await main();
