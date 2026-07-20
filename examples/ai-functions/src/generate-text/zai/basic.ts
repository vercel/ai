import { zai } from '@ai-sdk/zai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { text, usage } = await generateText({
    model: zai('glm-5.2'),
    prompt: 'What is the meaning of life? Answer in one sentence.',
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
});
