import 'dotenv/config';
import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';

const models = [
  'grok-4',
  'grok-4-1-fast-reasoning',
  'grok-4-1-fast-non-reasoning',
  'grok-4-fast-reasoning',
  'grok-4-fast-non-reasoning',
  'grok-code-fast-1',
  'grok-3',
  'grok-3-fast',
  'grok-3-mini',
  'grok-3-mini-fast',
];

async function main() {
  for (const modelId of models) {
    try {
      const result = await generateText({
        model: xai(modelId),
        prompt: 'Say a single word.',
      });

      const sdk = result.usage;

      console.log(`--- ${modelId} ---`);
      console.log(
        `sdk: outputTokens=${sdk.outputTokens}, reasoningTokens=${sdk.reasoningTokens}, totalTokens=${sdk.totalTokens}`,
      );
      console.log();
    } catch (e: any) {
      console.log(`--- ${modelId} ---`);
      console.log(`error: ${e.message?.slice(0, 80)}`);
      console.log();
    }
  }
}

main().catch(console.error);
