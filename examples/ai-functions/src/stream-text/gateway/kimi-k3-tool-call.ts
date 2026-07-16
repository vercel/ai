<<<<<<< HEAD:examples/ai-functions/src/stream-text/gateway/kimi-k2-5-tool-call.ts
import { type FireworksLanguageModelOptions } from '@ai-sdk/fireworks';
=======
import type { MoonshotAILanguageModelOptions } from '@ai-sdk/moonshotai';
>>>>>>> 341616a326 (feat: add kimi-k3 model and `reasoningEffort` provider option (#17394)):examples/ai-functions/src/stream-text/gateway/kimi-k3-tool-call.ts
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
