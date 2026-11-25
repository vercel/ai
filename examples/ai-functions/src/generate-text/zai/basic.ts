import { zai } from '@ai-sdk/zai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { text, usage, finishReason } = await generateText({
    model: zai('glm-5.3'),
    prompt: 'Explain why the sky is blue in a few sentences.',
  });

  console.log(text);
  console.log('Token usage:', usage);
  console.log('Finish reason:', finishReason);
});
