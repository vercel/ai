import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../../lib/run';

// Claude Sonnet 4.6 has no `xhigh` effort, so `reasoning: 'xhigh'` is sent as
// the next lower effort ('high') with a compatibility warning.
run(async () => {
  const { text, warnings } = await generateText({
    model: anthropic('claude-sonnet-4-6'),
    reasoning: 'xhigh',
    prompt: 'How many "r"s are in the word "strawberry"? Answer briefly.',
  });

  console.log(text);
  console.log('Warnings:', warnings);
});
