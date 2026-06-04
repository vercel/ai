import { crusoe } from '@ai-sdk/crusoe';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: crusoe('meta-llama/Llama-3.3-70B-Instruct'),
    prompt: 'Write a one sentence description about Seoul.',
  });

  console.log('Text:', result.text);
  console.log('\nUsage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
