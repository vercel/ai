import type { GoogleLanguageModelOptions } from '@ai-sdk/google';
import { googleVertex } from '@ai-sdk/google-vertex';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: googleVertex('gemini-3.1-pro-preview'),
    prompt: 'What color is the sky in one word?',
    providerOptions: {
      vertex: {
        serviceTier: 'priority',
      } satisfies GoogleLanguageModelOptions,
    },
  });

  await result.consumeStream();

  console.log(await result.text);
  console.log(
    'serviceTier:',
    (await result.providerMetadata)?.google?.serviceTier,
  );
});
