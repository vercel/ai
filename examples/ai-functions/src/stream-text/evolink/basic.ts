import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const evolink = createOpenAICompatible({
    baseURL: 'https://direct.evolink.ai/v1',
    name: 'evolink',
    apiKey: process.env.EVOLINK_API_KEY,
  });
  const model = evolink.chatModel('gpt-5.2');
  const result = streamText({
    model,
    prompt: 'Write a short introduction to EvoLink.AI.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
});
