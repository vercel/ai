import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  await generateText({
    model: openai('gpt-6-astra'),
    prompt: 'Invent a new holiday and describe its traditions.',
    onEnd(event) {
      console.dir(event, { depth: Infinity });
    },
  });
});
