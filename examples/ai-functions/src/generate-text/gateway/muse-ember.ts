import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { text, usage, finishReason } = await generateText({
    model: 'meta/muse-ember',
    prompt: 'Explain why the sky is blue in two sentences.',
  });

  console.log(text);
  console.log('Token usage:', usage);
  console.log('Finish reason:', finishReason);
});
