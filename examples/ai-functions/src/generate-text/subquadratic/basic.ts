import { subquadratic } from '@ai-sdk/subquadratic';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { text, reasoningText, usage, finishReason } = await generateText({
    model: subquadratic('subq-savant-1.4'),
    prompt: 'What is notable about Sonoran food? Answer in a few sentences.',
  });

  console.log(text);
  console.log();
  console.log('Reasoning:', reasoningText);
  console.log('Token usage:', usage);
  console.log('Finish reason:', finishReason);
});
