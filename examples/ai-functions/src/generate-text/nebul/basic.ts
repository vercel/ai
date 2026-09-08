import { nebul } from '@ai-sdk/nebul';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { text, usage, finishReason } = await generateText({
    model: nebul('zai-org/GLM-5.3-Flash'),
    prompt: 'Explain why the sky is blue in a few sentences.',
  });

  console.log(text);
  console.log('Token usage:', usage);
  console.log('Finish reason:', finishReason);
});
