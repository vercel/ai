import { deepseek, DeepSeekChatOptions } from '@ai-sdk/deepseek';
import { streamText } from 'ai';
import 'dotenv/config';
import { printFullStream } from '../lib/print-full-stream';
import { run } from '../lib/run';
import { weatherTool } from '../tools/weather-tool';

run(async () => {
  const result = streamText({
    model: deepseek('deepseek-reasoner'),
    tools: { weather: weatherTool },
    providerOptions: {
      deepseek: {
        thinking: { type: 'enabled' },
      } satisfies DeepSeekChatOptions,
    },
    prompt: 'What is the weather in San Francisco?',
  });

  printFullStream({ result });

  // TODO 2nd query
});
