import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-fable-5-1'),
    providerOptions: {
      anthropic: {
        thinking: {
          blockBinding: {
            prefixMismatchBehavior: 'drop_block',
          },
        },
      },
    },
    prompt:
      'Analyze whether this API change is backwards compatible: an optional response field is added.',
  });

  print('Reasoning:', result.reasoning);
  print('Text:', result.text);
  print('Request:', result.request.body);
});
