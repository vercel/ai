import type { MoonshotAILanguageModelOptions } from '@ai-sdk/moonshotai';
import { gateway } from '@ai-sdk/gateway';
import { stepCountIs, streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { weatherTool } from '../../tools/weather-tool';

run(async () => {
  const result = streamText({
    model: gateway('moonshotai/kimi-k3'),
    providerOptions: {
      moonshotai: {
        reasoningEffort: 'max',
      } satisfies MoonshotAILanguageModelOptions,
    },
    tools: { weather: weatherTool },
    stopWhen: stepCountIs(2),
    prompt: 'What is the weather in San Francisco?',
  });

  await printFullStream({ result });
});
