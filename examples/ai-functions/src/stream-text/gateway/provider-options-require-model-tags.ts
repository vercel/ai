import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    // `openai/gpt-5.5` carries the `implicit-caching` tag. Pointing at a model
    // that lacks it (e.g. an explicit-caching-only model) fails the request.
    model: 'openai/gpt-5.5',
    prompt: 'Tell me the history of the tenrec in a few sentences.',
    providerOptions: {
      gateway: {
        requireModelTags: ['implicit-caching'],
      } satisfies GatewayProviderOptions,
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
  console.log(
    'Provider metadata:',
    JSON.stringify((await result.finalStep).providerMetadata, null, 2),
  );
});
