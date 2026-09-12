import { nebul } from '@ai-sdk/nebul';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { text, usage } = await generateText({
    model: nebul('mistralai/Mistral-7B-Instruct-v0.3'),
    prompt: 'What is notable about Sonoran food? Answer in a few sentences.',
  });

  console.log(text);
  console.log();
  console.log('Token usage:', usage);
});
