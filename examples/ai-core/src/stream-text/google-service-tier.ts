import { google, type GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import { streamText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: google('gemini-3.1-pro-preview'),
    prompt: 'What color is the sky in one word?',
    providerOptions: {
      google: {
<<<<<<< HEAD:examples/ai-core/src/stream-text/google-service-tier.ts
        serviceTier: 'SERVICE_TIER_FLEX',
      } satisfies GoogleGenerativeAIProviderOptions,
=======
        serviceTier: 'priority',
      } satisfies GoogleLanguageModelOptions,
>>>>>>> 0f2b2f11f (Backport: fix(provider/google): fix Gemini service tier enum after upstream update (#14091)):examples/ai-functions/src/stream-text/google/service-tier.ts
    },
  });

  await result.consumeStream();

  console.log(await result.text);
  console.log(
    'serviceTier:',
    (await result.providerMetadata)?.google?.serviceTier,
  );
});
