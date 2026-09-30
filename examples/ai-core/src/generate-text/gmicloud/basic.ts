import { gmicloud } from '@ai-sdk/gmicloud';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { text, usage } = await generateText({
    model: gmicloud('deepseek-ai/DeepSeek-V4-Flash-0731'),
    prompt: 'What is notable about Sonoran food? Answer in a few sentences.',
  });

  console.log(text);
  console.log();
  console.log('Token usage:', usage);
});
