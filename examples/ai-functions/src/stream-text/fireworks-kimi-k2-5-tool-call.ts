import { fireworks } from '@ai-sdk/fireworks';
import { stepCountIs, streamText } from 'ai';
import { printFullStream } from '../lib/print-full-stream';
import { run } from '../lib/run';
import { weatherTool } from '../tools/weather-tool';

run(async () => {
  const result = streamText({
    model: fireworks('accounts/fireworks/models/kimi-k2p5'),
    providerOptions: {
      fireworks: {
        thinking: { type: 'enabled', budgetTokens: 4096 },
        reasoningHistory: 'interleaved',
      },
    },
    tools: { weather: weatherTool },
    stopWhen: stepCountIs(2),
    prompt: 'What is the weather in San Francisco?',
  });

  printFullStream({ result });
});
