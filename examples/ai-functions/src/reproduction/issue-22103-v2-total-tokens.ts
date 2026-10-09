import type { LanguageModelV2 } from '@ai-sdk/provider';
import { generateText } from 'ai';

const providerReportedUsage = {
  inputTokens: 10,
  outputTokens: 5,
  totalTokens: 20,
  reasoningTokens: 5,
};

const legacyModel: LanguageModelV2 = {
  specificationVersion: 'v2',
  provider: 'issue-22103-reproduction',
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
  const { usage } = await generateText({
    model: legacyModel,
    prompt: 'hello',
  });

  console.log(
    JSON.stringify({
      providerReportedUsage,
      publicUsage: usage,
    }),
  );

  if (usage.raw?.totalTokens !== providerReportedUsage.totalTokens) {
    throw new Error(
      'ISSUE_22103_REPRODUCED: provider-reported totalTokens is missing from public usage.raw',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
