import { concentrate } from '@ai-sdk/concentrate';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { text, usage } = await generateText({
    model: concentrate('glm-4.7-flash'),
    prompt: 'What is notable about Sonoran food? Answer in a few sentences.',
  });

  console.log(text);
  console.log();
  console.log('Token usage:', usage);
});
