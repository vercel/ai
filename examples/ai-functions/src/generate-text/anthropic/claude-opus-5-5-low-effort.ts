import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  // Opus 5.5 rejects `thinking: { type: 'disabled' }`. To reduce time to
  // first token, keep thinking adaptive and lower the effort instead.
  const result = await generateText({
    model: anthropic('claude-opus-5-5'),
    prompt:
      'Answer directly without deliberating: what is the capital of France?',
    providerOptions: {
      anthropic: {
        effort: 'low',
      },
    },
  });

  print('Text:', result.text);
  print('Usage:', result.usage);
});
