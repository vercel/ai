import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { createGateway, streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const gateway = createGateway({ regionalHosting: 'eu' });
  const result = streamText({
    model: gateway('anthropic/claude-sonnet-4.5'),
    prompt: 'Explain how a rainbow forms.',
    providerOptions: {
      gateway: {
        // Keep the ingress assertion without the default inference constraint.
        regionalHosting: { region: 'eu', pinInference: false },
      } satisfies GatewayProviderOptions,
    },
  });

  for await (const text of result.textStream) {
    process.stdout.write(text);
  }
  console.log();
});
