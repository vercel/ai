import { cerebras, type CerebrasChatProviderOptions } from '@ai-sdk/cerebras';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: cerebras('gpt-oss-120b'),
    prompt: 'What color is the sky in one word?',
    providerOptions: {
      cerebras: {
        // `auto` works on shared endpoints and echoes back the effective tier.
        serviceTier: 'auto',
        // Reject the request if the expected flex queue time exceeds 200ms.
        queueThreshold: 200,
      } satisfies CerebrasChatProviderOptions,
    },
  });

  console.log(result.text);
  console.log();
  console.log('serviceTier:', result.providerMetadata?.cerebras?.serviceTier);
});
