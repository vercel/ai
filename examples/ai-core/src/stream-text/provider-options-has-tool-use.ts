import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { stepCountIs, streamText } from 'ai';
import { printFullStream } from '../lib/print-full-stream';
import { run } from '../lib/run';
import { weatherTool } from '../tools/weather-tool';

run(async () => {
  const result = streamText({
    model: 'anthropic/claude-sonnet-4.6',
    providerOptions: {
      gateway: {
        has: ['tool-use'],
      } satisfies GatewayProviderOptions,
    },
    tools: { weather: weatherTool },
    stopWhen: stepCountIs(2),
    prompt: 'What is the weather in San Francisco?',
  });

  await printFullStream({ result });
});
