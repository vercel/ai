import { anthropic } from '@ai-sdk/anthropic';
import { stepCountIs, streamText } from 'ai';
import 'dotenv/config';
import { weatherTool } from '../tools/weather-tool';
import { printFullStream } from '../lib/print-full-stream';

async function main() {
  const result = streamText({
    model: anthropic('claude-fable-5'),
    stopWhen: stepCountIs(5),
    tools: {
      weather: weatherTool,
    },
    prompt:
      'What is the weather in San Francisco, New York, and London? ' +
      'Compare them and tell me which is warmest.',
  });

  await printFullStream({ result });
}

main().catch(console.error);
