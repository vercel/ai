import { inception } from '@ai-sdk/inception';
import { generateText, isStepCount } from 'ai';
import { run } from '../../lib/run';
import { weatherTool } from '../../tools/weather-tool';

run(async () => {
  const result = await generateText({
    model: inception('mercury-3'),
    tools: { weather: weatherTool },
    stopWhen: isStepCount(3),
    prompt:
      'Use the weather tool to compare the weather in San Francisco and London.',
  });

  for (const step of result.steps) {
    console.log('Tool calls:', step.toolCalls);
    console.log('Tool results:', step.toolResults);
  }
  console.log(result.text);
  console.log('Token usage:', result.totalUsage);
});
