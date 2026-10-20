import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { isStepCount, streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { weatherTool } from '../../tools/weather-tool';

run(async () => {
  // `between_tools` skips upfront thinking. The progress notes Sonnet 5.5
  // writes between tool calls are streamed as short reasoning summaries.
  const result = streamText({
    model: anthropic('claude-sonnet-5-5'),
    stopWhen: isStepCount(5),
    tools: {
      weather: weatherTool,
    },
    providerOptions: {
      anthropic: {
        thinking: { type: 'between_tools' },
      } satisfies AnthropicLanguageModelOptions,
    },
    prompt:
      'Compare the weather in San Francisco and New York, then recommend where to hold an outdoor event.',
  });

  await printFullStream({ result });
});
