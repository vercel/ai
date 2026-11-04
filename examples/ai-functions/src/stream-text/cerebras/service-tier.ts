import {
  createCerebras,
  type CerebrasLanguageModelChatOptions,
} from '@ai-sdk/cerebras';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  // Service tiers require a preview-enabled dedicated Cerebras endpoint.
  const baseURL = process.env.CEREBRAS_BASE_URL;
  if (!baseURL) {
    throw new Error(
      'Set CEREBRAS_BASE_URL to your preview-enabled dedicated endpoint.',
    );
  }
  const cerebras = createCerebras({ baseURL });
  const result = streamText({
    model: cerebras(process.env.CEREBRAS_MODEL ?? 'gpt-oss-120b'),
    prompt: 'What color is the sky in one word?',
    providerOptions: {
      cerebras: {
        // Start at standard priority and fall back to flex when needed.
        serviceTier: 'auto',
        // Reject the request if the expected flex queue time exceeds 200ms.
        queueThreshold: 200,
      } satisfies CerebrasLanguageModelChatOptions,
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
