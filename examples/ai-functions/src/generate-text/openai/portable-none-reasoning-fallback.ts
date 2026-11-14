import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

// GPT-6 Astra cannot disable reasoning, so `reasoning: 'none'` is sent as the
// lowest supported effort ('low') with a compatibility warning.
run(async () => {
  const { text, warnings } = await generateText({
    model: openai('gpt-6-astra'),
    reasoning: 'none',
    prompt: 'How many "r"s are in the word "strawberry"? Answer briefly.',
  });

  console.log(text);
  console.log('Warnings:', warnings);
});
