import { openai } from '@ai-sdk/openai';
import { generateText, Output, stepCountIs } from 'ai';
import { print } from '../lib/print';
import { run } from '../lib/run';
import { weatherTool } from '../tools/weather-tool';

run(async () => {
  const result = await generateText({
    model: openai('gpt-4o-mini'),
    tools: { weather: weatherTool },
    stopWhen: stepCountIs(5),
    output: Output.json(),
    system: 'Return JSON only, no other text.',
    prompt: 'What is the weather in San Francisco, London, Paris, and Berlin?',
  });

  print('Output:', result.output);
  print('Request:', result.request.body);
});
