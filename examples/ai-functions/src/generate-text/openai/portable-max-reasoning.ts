import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { text, usage, warnings } = await generateText({
    model: openai('gpt-5.6'),
    reasoning: 'max',
    prompt: 'How many "r"s are in the word "strawberry"? Answer briefly.',
  });

  console.log(text);
  console.log('Usage:', usage);
  console.log('Warnings:', warnings);
});
