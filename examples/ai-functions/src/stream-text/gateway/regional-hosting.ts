import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: 'openai/gpt-5',
    prompt: 'Explain how a rainbow forms in one sentence.',
    providerOptions: {
      gateway: {
        // Model strings use the default Gateway provider without configuration.
        // Select the Gateway endpoint, not the model's inference location.
        regionalHosting: 'us',
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
