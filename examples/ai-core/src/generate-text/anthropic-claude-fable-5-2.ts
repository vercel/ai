import { type AnthropicProviderOptions, anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  // Fable 5.2 always uses adaptive thinking. Effort is the main control for
  // latency and cost; the API default is 'high'.
  const result = await generateText({
    model: anthropic('claude-fable-5-2'),
    prompt: 'Invent a new holiday and describe its traditions.',
    maxOutputTokens: 64000,
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive', display: 'summarized' },
        effort: 'high',
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
