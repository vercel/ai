import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  // Opus 5.5 always uses adaptive thinking. Effort is the main control for
  // latency and cost; the API default is 'medium'.
  const result = await generateText({
    model: anthropic('claude-opus-5-5'),
    prompt: 'Invent a new holiday and describe its traditions.',
    maxOutputTokens: 64000,
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive', display: 'summarized' },
        effort: 'medium',
      },
    },
  });

  print('Reasoning:', result.reasoningText);
  print('Text:', result.text);
  print('Usage:', result.usage);
  print('Warnings:', result.warnings);
});
