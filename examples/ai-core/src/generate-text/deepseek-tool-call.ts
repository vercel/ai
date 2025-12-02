import { deepseek, DeepSeekChatOptions } from '@ai-sdk/deepseek';
import { generateText } from 'ai';
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
    prompt: 'What is the weather in San Francisco?',
  });

  print('Content:', result.content);
});
