import { bedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, stepCountIs } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: bedrock('us.anthropic.claude-3-7-sonnet-20250219-v1:0'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    temperature: 0.5, // should get ignored (warning)
    providerOptions: {
      bedrock: {
        reasoningConfig: { type: 'enabled', budgetTokens: 2048 },
      },
    },
    maxRetries: 0,
    stopWhen: stepCountIs(5),
  });

  console.log('Reasoning:');
  console.log(result.reasoning);
  console.log();

  console.log('Text:');
  console.log(result.text);
  console.log();

  console.log('Warnings:', result.warnings);
}

main().catch(console.error);
