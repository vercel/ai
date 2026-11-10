import { tencent } from '@ai-sdk/tencent';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { text, usage } = await generateText({
    model: tencent('hy4'),
    prompt: 'What is notable about Sonoran food? Answer in a few sentences.',
  });

  console.log(text);
  console.log();
  console.log('Token usage:', usage);
});
