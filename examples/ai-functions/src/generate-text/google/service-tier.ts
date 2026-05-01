import { google, type GoogleLanguageModelOptions } from '@ai-sdk/google';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: google('gemini-3.1-pro-preview'),
    prompt: 'What color is the sky in one word?',
    providerOptions: {
      google: {
        serviceTier: 'flex',
      } satisfies GoogleLanguageModelOptions,
    },
  });

  console.log(result.text);
  console.log('serviceTier:', result.providerMetadata?.google?.serviceTier);
});
