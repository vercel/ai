import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: openai('gpt-6-luna'),
    instructions: 'You are a helpful assistant.',
    messages: [{ role: 'user', content: 'What is the capital of France?' }],
  });

  console.log(result.text);
});
