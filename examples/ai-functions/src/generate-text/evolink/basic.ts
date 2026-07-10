import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const evolink = createOpenAICompatible({
    baseURL: 'https://direct.evolink.ai/v1',
    name: 'evolink',
    apiKey: process.env.EVOLINK_API_KEY,
  });
  const model = evolink.chatModel('gpt-5.2');
  const result = await generateText({
    model,
    prompt: 'Write a short introduction to EvoLink.AI.',
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});
