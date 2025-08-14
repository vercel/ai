import { openai, OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: openai('gpt-5'),
    prompt: 'How many "r"s are in the word "strawberry"?',
    providerOptions: {
      openai: {
        reasoningEffort: 'low',
        reasoningSummary: 'detailed',
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'reasoning-start':
        process.stdout.write('\x1b[34m');
        break;

      case 'reasoning-delta':
        process.stdout.write(chunk.text);
        break;

      case 'reasoning-end':
        process.stdout.write('\x1b[0m');
        process.stdout.write('\n');
        break;

      case 'text-start':
        process.stdout.write('\x1b[0m');
        break;

      case 'text-delta':
        process.stdout.write(chunk.text);
        break;

      case 'text-end':
        process.stdout.write('\x1b[0m');
        console.log();
        break;
    }
  }
}

main().catch(console.error);
