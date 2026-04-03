import { google, type GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: google('gemini-3.1-pro-preview'),
    prompt: 'What color is the sky in one word?',
    providerOptions: {
      google: {
<<<<<<< HEAD:examples/ai-core/src/generate-text/google-service-tier.ts
        serviceTier: 'SERVICE_TIER_FLEX',
      } satisfies GoogleGenerativeAIProviderOptions,
=======
        serviceTier: 'flex',
      } satisfies GoogleLanguageModelOptions,
>>>>>>> 0f2b2f11f (Backport: fix(provider/google): fix Gemini service tier enum after upstream update (#14091)):examples/ai-functions/src/generate-text/google/service-tier.ts
    },
  });

  console.log(result.text);
  console.log('serviceTier:', result.providerMetadata?.google?.serviceTier);
});
