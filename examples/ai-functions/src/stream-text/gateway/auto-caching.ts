import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: 'anthropic/claude-sonnet-4.6',
    system:
      'You are a helpful assistant with access to a large knowledge base. ' +
      'Answer questions concisely and accurately.',
    prompt: 'What is the capital of France?',
    providerOptions: {
      gateway: {
        caching: 'auto',
      } satisfies GatewayProviderOptions,
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
});
