import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { createGateway, generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  // Endpoint selection and request assertions are separate in this proposal.
  const gateway = createGateway({ regionalHosting: 'eu' });
  const { text } = await generateText({
    model: gateway('anthropic/claude-sonnet-4.5'),
    prompt: 'Explain how a rainbow forms.',
    providerOptions: {
      gateway: {
        regionalHosting: 'eu',
      } satisfies GatewayProviderOptions,
    },
  });

  console.log(text);
});
