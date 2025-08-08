import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai.responses('gpt-5-mini'),
    prompt: 'Write a poem about a boy and his first pet dog.',
    providerOptions: {
      openai: {
        verbosity: 'low',
      },
    },
  });

  console.log('Verbosity: low');
  console.log('Output tokens:', result.usage?.outputTokens);
  console.log('Text:', result.text);
}

main().catch(console.error);