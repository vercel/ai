import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai.responses('gpt-5'),
    prompt: 'Write a poem about a boy and his first pet dog.',
    providerOptions: {
      openai: {
        textVerbosity: 'low',
      },
    },
  });

  console.log('Verbosity:', (result.request?.body as any)?.text?.verbosity);
  console.log('Response:', result.response?.body);
}

main().catch(console.error);
