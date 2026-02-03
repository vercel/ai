import { alibaba } from '@ai-sdk/alibaba';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: alibaba('qwen3-max'),
    prompt: 'What is the sum of the first 3 prime numbers?',
    providerOptions: {
      alibaba: {
        enableThinking: true,
      },
    },
  });

  console.log('Text:', result.text);
  console.log('\nUsage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
