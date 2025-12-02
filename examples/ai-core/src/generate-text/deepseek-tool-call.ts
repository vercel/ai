import { deepseek, DeepSeekChatOptions } from '@ai-sdk/deepseek';
import { generateText, stepCountIs } from 'ai';
import { print } from '../lib/print';
import { run } from '../lib/run';
import { weatherTool } from '../tools/weather-tool';

run(async () => {
  const result = await generateText({
    model: deepseek('deepseek-reasoner'),
    tools: { weather: weatherTool },
    providerOptions: {
      deepseek: {
        thinking: { type: 'enabled' },
      } satisfies DeepSeekChatOptions,
    },
    stopWhen: stepCountIs(2),
    prompt: 'What is the weather in San Francisco?',
  });

  print('Content:', result.content);
});
