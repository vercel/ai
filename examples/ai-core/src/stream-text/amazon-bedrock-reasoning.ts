import { bedrock } from '@ai-sdk/amazon-bedrock';
import { stepCountIs, streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: bedrock('us.anthropic.claude-3-7-sonnet-20250219-v1:0'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    temperature: 0.5, // should get ignored (warning)
    onError: error => {
      console.error(error);
    },
    providerOptions: {
      bedrock: {
        reasoningConfig: { type: 'enabled', budgetTokens: 1024 },
      },
    },
    maxRetries: 0,
    stopWhen: stepCountIs(5),
  });

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      process.stdout.write('\x1b[34m' + part.text + '\x1b[0m');
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }

  console.log();
  console.log('Warnings:', await result.warnings);
}

main().catch(console.error);
