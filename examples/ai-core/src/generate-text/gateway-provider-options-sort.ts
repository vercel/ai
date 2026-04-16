import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const { providerMetadata, text, usage } = await generateText({
    model: 'openai/gpt-oss-120b',
    prompt: 'Invent a new holiday and describe its traditions.',
    providerOptions: {
      gateway: {
        sort: 'ttft',
      } satisfies GatewayProviderOptions,
    },
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
  console.log(JSON.stringify(providerMetadata, null, 2));
});
