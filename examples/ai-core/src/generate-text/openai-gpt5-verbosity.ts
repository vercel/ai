import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai.responses('gpt-5'),
    prompt: 'Write a poem about a boy and his first pet dog.',
    providerOptions: {
      openai: {
        text: {
          verbosity: 'low',
        },
      },
    },
  });

  console.log('Output tokens:', result.usage?.outputTokens);
  console.log('Text:', result.text);
  console.log('Request:', result.request?.body);
  console.log('Response:', result.response?.body);
}

main().catch(console.error);
