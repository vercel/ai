import { deepseek } from '@ai-sdk/deepseek';
import { stepCountIs, streamText } from 'ai';
import { printFullStream } from '../lib/print-full-stream';
import { run } from '../lib/run';
import { weatherTool } from '../tools/weather-tool';

run(async () => {
  const result = streamText({
    model: deepseek('deepseek-v4-pro'),
    tools: { weather: weatherTool },
    stopWhen: stepCountIs(2),
    prompt: 'What is the weather in San Francisco?',
  });

  printFullStream({ result });
});
