import { deepseek } from '@ai-sdk/deepseek';
import { generateText, Output, stepCountIs } from 'ai';
import { print } from '../lib/print';
import { run } from '../lib/run';
import { weatherTool } from '../tools/weather-tool';

run(async () => {
  const result = await generateText({
    model: deepseek('deepseek-reasoner'),
    tools: { weather: weatherTool },
    stopWhen: stepCountIs(5),
    output: Output.json(),
    prompt: 'What is the weather in San Francisco, London, Paris, and Berlin?',
  });

  print('Output:', result.output);
  print('Request:', result.request.body);
});
