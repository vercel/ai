import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: openai.chat('gpt-5'),
    prompt: 'Write a poem about a boy and his first pet dog.',
    providerOptions: {
      openai: {
        textVerbosity: 'low',
      },
    },
  });

  console.log('Response:', result.response?.body);
  console.log('Request:', result.request?.body);
});
