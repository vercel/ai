import { openai } from '@ai-sdk/openai';
import { generateText, registerTelemetry, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';
import { weatherTool } from '../../tools/weather-tool';
import { consoleTelemetry } from './console-telemetry';

registerTelemetry(consoleTelemetry);

run(async () => {
  await generateText({
    model: openai('gpt-3.5-turbo'),
    maxOutputTokens: 512,
    tools: {
      weather: weatherTool,
      cityAttractions: tool({
        inputSchema: z.object({ city: z.string() }),
      }),
    },
    runtimeContext: {
      something: 'custom',
      someOtherThing: 'other-value',
    },
    prompt:
      'What is the weather in San Francisco and what attractions should I visit?',
    telemetry: {
      functionId: 'my-awesome-function',
    },
  });
});
