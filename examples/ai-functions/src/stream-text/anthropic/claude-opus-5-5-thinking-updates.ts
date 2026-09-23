import { anthropic } from '@ai-sdk/anthropic';
import { isStepCount, streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { weatherTool } from '../../tools/weather-tool';

run(async () => {
  // Opus 5.5 returns progress notes between tool calls as thinking blocks.
  // `display: 'updates'` streams a short summary of each note.
  const result = streamText({
    model: anthropic('claude-opus-5-5'),
    stopWhen: isStepCount(5),
    tools: {
      weather: weatherTool,
    },
    providerOptions: {
      anthropic: {
        thinking: {
          type: 'adaptive',
          display: 'updates',
        },
      },
    },
    prompt:
      'Compare the weather in San Francisco and New York, then recommend where to hold an outdoor event.',
  });

  await printFullStream({ result });
});
