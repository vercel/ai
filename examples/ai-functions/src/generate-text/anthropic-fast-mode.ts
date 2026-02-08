import { anthropic, AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-opus-4-6'),
    prompt: 'Explain quantum entanglement in two sentences.',
    providerOptions: {
      anthropic: {
        speed: 'fast',
      } satisfies AnthropicProviderOptions,
    },
  });

  console.log('Text:');
  console.log(result.text);
  console.log();

  console.log('Usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
  console.log();

  // Response headers include fast mode rate limit info
  console.log('Response headers:', result.response.headers);
  console.log();

  // Provider metadata includes speed confirmation in usage
  const anthropicMeta = result.providerMetadata?.anthropic as Record<
    string,
    unknown
  >;
  console.log(
    'Speed:',
    (anthropicMeta?.usage as Record<string, unknown>)?.speed,
  );
  console.log('Provider metadata:', JSON.stringify(anthropicMeta, null, 2));
});
