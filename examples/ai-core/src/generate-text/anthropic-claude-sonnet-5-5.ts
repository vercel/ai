import { type AnthropicProviderOptions, anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  // Sonnet 5.5 uses adaptive thinking by default and cannot turn thinking off.
  // Effort is the main control for latency and cost; the API default is 'high'.
  const result = await generateText({
    model: anthropic('claude-sonnet-5-5'),
    prompt: 'Invent a new holiday and describe its traditions.',
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive', display: 'summarized' },
        effort: 'medium',
      } satisfies AnthropicProviderOptions,
    },
  });

  console.log('Reasoning:');
  console.log(result.reasoningText);
  console.log();

  console.log('Text:');
  console.log(result.text);
  console.log();

  console.log('Usage:', result.usage);
  console.log('Warnings:', result.warnings);
}

main().catch(console.error);
