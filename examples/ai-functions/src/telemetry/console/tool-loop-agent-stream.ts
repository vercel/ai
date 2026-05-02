import { openai } from '@ai-sdk/openai';
import { registerTelemetry, tool, ToolLoopAgent } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';
import { consoleTelemetry } from './console-telemetry';

registerTelemetry(consoleTelemetry);

const agent = new ToolLoopAgent({
  model: openai('gpt-5-mini'),
  instructions: 'You are a helpful assistant. Use the weather tool.',
  tools: {
    weather: tool({
      description: 'Get the weather in a location',
      inputSchema: z.object({
        location: z.string().describe('The location to get the weather for'),
      }),
      contextSchema: z.object({
        requestId: z.string(),
        secretKey: z.string(),
      }),
      sensitiveContext: {
        secretKey: true,
      },
      execute: async ({ location }, { context }) => ({
        location,
        temperature: 72,
        authenticated: context.secretKey.length > 0,
        requestId: context.requestId,
      }),
    }),
  },
  toolsContext: {
    weather: {
      requestId: 'weather-request-123',
      secretKey: 'weather-secret-key',
    },
  },
  runtimeContext: {
    userId: 'user-123',
    requestId: 'request-123',
    secretApiKey: 'sk-secret',
  },
  sensitiveRuntimeContext: {
    secretApiKey: true,
  },
  telemetry: {
    functionId: 'my-awesome-agent',
  },
});

run(async () => {
  const result = await agent.stream({
    prompt: 'What is the weather in San Francisco?',
  });

  await result.consumeStream();
});
