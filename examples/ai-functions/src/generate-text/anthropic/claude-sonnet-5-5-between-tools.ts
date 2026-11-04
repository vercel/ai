import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { generateText, isStepCount } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';
import { weatherTool } from '../../tools/weather-tool';

run(async () => {
  // `between_tools` is the lowest thinking setting on Sonnet 5.5: no upfront
  // thinking, but progress notes between tool calls come back as summarized
  // thinking blocks. It is accepted at 'low', 'medium', and 'high' effort.
  const result = await generateText({
    model: anthropic('claude-sonnet-5-5'),
    stopWhen: isStepCount(5),
    tools: {
      weather: weatherTool,
    },
    providerOptions: {
      anthropic: {
        thinking: { type: 'between_tools' },
        effort: 'low',
      } satisfies AnthropicLanguageModelOptions,
    },
    prompt:
      'Compare the weather in San Francisco and New York, then recommend where to hold an outdoor event.',
  });

  for (const step of result.steps) {
    print(`Step ${step.stepNumber} reasoning:`, step.reasoningText);
  }
  print('Text:', result.text);
  print('Usage:', result.usage);
  print('Warnings:', result.warnings);
});
