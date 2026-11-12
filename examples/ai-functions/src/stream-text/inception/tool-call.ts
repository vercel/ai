import { inception } from '@ai-sdk/inception';
import { isStepCount, streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { weatherTool } from '../../tools/weather-tool';

run(async () => {
  const result = streamText({
    model: inception('mercury-3'),
    tools: { weather: weatherTool },
    stopWhen: isStepCount(3),
    prompt:
      'Use the weather tool to compare the weather in San Francisco and London.',
  });

  await printFullStream({ result });
});
