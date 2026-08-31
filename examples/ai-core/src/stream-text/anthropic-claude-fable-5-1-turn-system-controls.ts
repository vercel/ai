import {
  type AnthropicSystemMessageProviderOptions,
  anthropic,
} from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: anthropic('claude-fable-5-1'),
    allowSystemInMessages: true,
    messages: [
      {
        role: 'user',
        content: 'Explain why the sky is blue.',
      },
      {
        role: 'assistant',
        content:
          'Sunlight contains many colors, which interact differently with the atmosphere.',
      },
      {
        role: 'system',
        content: 'For this turn only, answer in one short sentence.',
        providerOptions: {
          anthropic: {
            clearAt: 'next_user_message',
            effort: 'low',
          } satisfies AnthropicSystemMessageProviderOptions,
        },
      },
      {
        role: 'user',
        content: 'What is Rayleigh scattering?',
      },
    ],
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Warnings:', await result.warnings);
}

main().catch(console.error);
