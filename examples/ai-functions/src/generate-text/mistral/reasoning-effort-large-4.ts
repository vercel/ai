import { mistral } from '@ai-sdk/mistral';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: mistral('mistral-large-4'),
    reasoning: 'none',
    prompt: 'What is 2 + 2?',
  });

  console.log('Reasoning content:');
  console.log(result.reasoningText);
  console.log();
  console.log('Final answer:');
  console.log(result.text);
  console.log();
  console.log('Warnings:', result.warnings);
});
