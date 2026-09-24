import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: 'anthropic/claude-sonnet-4.6',
    prompt: 'Explain quantization in neural networks.',
    providerOptions: {
      gateway: {
        has: ['!quantization:fp8'],
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
