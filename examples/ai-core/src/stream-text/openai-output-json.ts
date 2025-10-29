import { openai } from '@ai-sdk/openai';
import { Output, stepCountIs, streamText } from 'ai';
import { run } from '../lib/run';
import { weatherTool } from '../tools/weather-tool';

run(async () => {
  const result = streamText({
    model: openai('gpt-4o-mini'),
    tools: { weather: weatherTool },
    stopWhen: stepCountIs(5),
    output: Output.json(),
    system: 'Return JSON only, no other text.',
    prompt: 'What is the weather in San Francisco, London, Paris, and Berlin?',
  });

  for await (const partialOutput of result.partialOutputStream) {
    console.clear();
    console.log(partialOutput);
  }
});
