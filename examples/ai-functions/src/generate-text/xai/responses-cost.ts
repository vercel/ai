import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: xai.responses('grok-4-fast-non-reasoning'),
    prompt: 'What is the capital of France?',
  });

  console.log(result.text);
  console.log();
  console.log('Usage:', result.usage);

  const costInUsdTicks = result.providerMetadata?.xai?.costInUsdTicks as
    | number
    | undefined;
  if (costInUsdTicks != null) {
    console.log('Cost (usd ticks):', costInUsdTicks);
    console.log('Cost (USD):', (costInUsdTicks / 1e8).toFixed(6));
  }
});
