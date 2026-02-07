import { anthropic, AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { printFullStream } from '../lib/print-full-stream';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: anthropic('claude-opus-4-6'),
    prompt: 'Explain quantum entanglement in two sentences.',
    providerOptions: {
      anthropic: {
        speed: 'fast',
      } satisfies AnthropicProviderOptions,
    },
  });

  printFullStream({ result });

  console.log();
  console.log('Usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
  console.log();

  // Provider metadata includes speed confirmation in usage
  const metadata = await result.providerMetadata;
  const anthropicMeta = metadata?.anthropic as Record<string, unknown>;
  console.log(
    'Speed:',
    (anthropicMeta?.usage as Record<string, unknown>)?.speed,
  );
  console.log('Provider metadata:', JSON.stringify(anthropicMeta, null, 2));
});
