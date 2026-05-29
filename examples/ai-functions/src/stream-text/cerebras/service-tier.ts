import { cerebras, type CerebrasChatProviderOptions } from '@ai-sdk/cerebras';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
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

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log(
    'serviceTier:',
    (await result.providerMetadata)?.cerebras?.serviceTier,
  );
});
