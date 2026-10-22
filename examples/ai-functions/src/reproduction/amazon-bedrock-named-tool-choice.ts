// Deterministic public-API reproduction; no live provider calls.
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

// A three-step run where only the second step forces a tool. Anthropic models
// on Amazon Bedrock enforce a named tool choice themselves, so every step
// should send the same tool definitions: changing them invalidates the whole
// prompt cache, while changing the tool choice only invalidates messages.
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
const responses = [
  toolUseResponse('getWeatherByCity', { city: 'San Francisco' }),
  toolUseResponse('getWeatherForecast', { location: 'San Francisco', days: 3 }),
  {
    output: {
      message: { role: 'assistant', content: [{ text: 'Sunny all week.' }] },
    },
    stopReason: 'end_turn',
    usage,
  },
];

function toolUseResponse(name: string, input: Record<string, unknown>) {
  return {
    output: {
      message: {
        role: 'assistant',
        content: [{ toolUse: { toolUseId: `tool-${name}`, name, input } }],
      },
    },
    stopReason: 'tool_use',
    usage,
  };
}

run(async () => {
  const requestedTools: string[][] = [];
  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      requestedTools.push(
        body.toolConfig.tools.map(
          (tool: { toolSpec: { name: string } }) => tool.toolSpec.name,
        ),
      );
      return Response.json(responses[requestedTools.length - 1]);
    },
  });

  await generateText({
    model: bedrock('us.anthropic.claude-haiku-4-5-20251001-v1:0'),
    tools: {
      getWeatherByCity: tool({
        description: 'Get current weather by city name',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => ({ city, forecast: 'sunny' }),
      }),
      getWeatherForecast: tool({
        description: 'Get weather forecast for the next N days',
        inputSchema: z.object({ location: z.string(), days: z.number() }),
        execute: async ({ location, days }) => ({
          location,
          forecast: Array.from({ length: days }, () => 'sunny'),
        }),
      }),
      getCurrentTime: tool({
        description: 'Get the current time in a city',
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => ({ city, time: '09:00' }),
      }),
    },
    prepareStep: ({ stepNumber }) =>
      stepNumber === 1
        ? { toolChoice: { type: 'tool', toolName: 'getWeatherForecast' } }
        : undefined,
    stopWhen: isStepCount(3),
    maxRetries: 0,
    prompt: 'What is the weather in San Francisco this week?',
  });

  requestedTools.forEach((names, step) =>
    console.log(`step ${step}: ${names.join(', ')}`),
  );

  if (new Set(requestedTools.map(names => names.join())).size > 1) {
    console.error(
      'BUG REPRODUCED: the forced step sends different tool definitions than the other steps.',
    );
  } else {
    console.log('Not reproduced: every step sends the same tool definitions.');
  }
});
