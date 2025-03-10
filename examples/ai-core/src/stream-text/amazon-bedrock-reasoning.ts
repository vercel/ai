import { bedrock } from '@ai-sdk/amazon-bedrock';
import { streamText } from 'ai';
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
        reasoning_config: { type: 'enabled', budgetTokens: 1024 },
      },
    },
    maxRetries: 0,
    maxSteps: 5,
  });

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning') {
      process.stdout.write('\x1b[34m' + part.textDelta + '\x1b[0m');
    } else if (part.type === 'redacted-reasoning') {
      process.stdout.write('\x1b[31m' + '<redacted>' + '\x1b[0m');
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.textDelta);
    }
  }

  console.log();
  console.log('Warnings:', await result.warnings);
}

main().catch(console.error);
