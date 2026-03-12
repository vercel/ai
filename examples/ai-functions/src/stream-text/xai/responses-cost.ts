import { xai } from '@ai-sdk/xai';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: xai.responses('grok-4-fast-non-reasoning'),
    prompt: 'What is the capital of France?',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();

  const metadata = await result.providerMetadata;
  const costInUsdTicks = metadata?.xai?.costInUsdTicks as number | undefined;
  if (costInUsdTicks != null) {
    console.log('Cost (usd ticks):', costInUsdTicks);
    console.log('Cost (USD):', (costInUsdTicks / 1e8).toFixed(6));
  }

  console.log('Usage:', await result.usage);
});
