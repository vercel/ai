import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { createGateway, generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const gateway = createGateway({ regionalHosting: 'eu' });

  const result = await generateText({
    model: gateway('openai/gpt-5'),
    prompt: 'Explain how a rainbow forms in one sentence.',
    providerOptions: {
      gateway: {
        // Override the instance default for this call's Gateway endpoint only.
        // This does not restrict where model inference runs.
        regionalHosting: 'au',
      } satisfies GatewayProviderOptions,
    },
  });

  console.log(result.text);
  console.log('Usage:', result.usage);
});
