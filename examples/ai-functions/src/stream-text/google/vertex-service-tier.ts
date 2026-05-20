<<<<<<< HEAD
import { type GoogleLanguageModelOptions } from '@ai-sdk/google';
import { vertex } from '@ai-sdk/google-vertex';
=======
import type {
  GoogleLanguageModelOptions,
  GoogleProviderMetadata,
} from '@ai-sdk/google';
import { googleVertex } from '@ai-sdk/google-vertex';
>>>>>>> aeea1610b (fix(google): read serviceTier from x-gemini-service-tier response header (#14937))
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: vertex('gemini-3.1-pro-preview'),
    prompt: 'What color is the sky in one word?',
    providerOptions: {
      vertex: {
        sharedRequestType: 'priority',
      } satisfies GoogleLanguageModelOptions,
    },
  });

  await result.consumeStream();

  const metadata = (await result.finalStep).providerMetadata?.googleVertex as
    | GoogleProviderMetadata
    | undefined;

  console.log(await result.text);
<<<<<<< HEAD
  console.log(
    'serviceTier:',
    (await result.providerMetadata)?.google?.serviceTier,
  );
=======
  console.log('trafficType:', metadata?.usageMetadata?.trafficType);
>>>>>>> aeea1610b (fix(google): read serviceTier from x-gemini-service-tier response header (#14937))
});
