import type { GoogleLanguageModelOptions } from '@ai-sdk/google';
import { googleVertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: googleVertex('gemini-3.1-pro-preview'),
    prompt: 'What color is the sky in one word?',
    providerOptions: {
      vertex: {
        serviceTier: 'flex',
      } satisfies GoogleLanguageModelOptions,
    },
  });

  console.log(result.text);
  console.log('serviceTier:', result.providerMetadata?.google?.serviceTier);
});
