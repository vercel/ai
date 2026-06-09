import { type AnthropicProviderOptions, anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: anthropic('claude-fable-5'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    onError: error => {
      console.error(error);
    },
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive', display: 'summarized' },
        effort: 'high',
      } satisfies AnthropicProviderOptions,
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'reasoning-delta') {
      process.stdout.write('\x1b[34m' + part.text + '\x1b[0m');

      if (part.providerMetadata?.anthropic?.redactedData != null) {
        process.stdout.write('\x1b[31m' + '<redacted>' + '\x1b[0m');
      }
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }

  console.log();
  console.log('Warnings:', await result.warnings);
}

main().catch(console.error);
