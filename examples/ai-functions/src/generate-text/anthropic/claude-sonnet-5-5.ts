import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  // Sonnet 5.5 uses adaptive thinking by default and cannot turn thinking off.
  // Effort is the main control for latency and cost; the API default is 'high'.
  const result = await generateText({
    model: anthropic('claude-sonnet-5-5'),
    prompt: 'Invent a new holiday and describe its traditions.',
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive', display: 'summarized' },
        effort: 'medium',
      } satisfies AnthropicLanguageModelOptions,
    },
  });

  print('Reasoning:', result.reasoningText);
  print('Text:', result.text);
  print('Usage:', result.usage);
  print('Warnings:', result.warnings);
});
