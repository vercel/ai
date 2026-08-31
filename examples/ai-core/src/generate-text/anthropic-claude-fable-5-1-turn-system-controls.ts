import {
  type AnthropicSystemMessageProviderOptions,
  anthropic,
} from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
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

  console.log(result.text);
  console.log('Warnings:', result.warnings);
}

main().catch(console.error);
