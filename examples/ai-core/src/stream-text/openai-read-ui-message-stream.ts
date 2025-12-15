import { openai } from '@ai-sdk/openai';
import { readUIMessageStream, stepCountIs, streamText, Tool, tool } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const toModelOutputArgs: Array<
    Parameters<NonNullable<Tool['toModelOutput']>>[0]
  > = [];

  const result = streamText({
    model: openai('gpt-5-mini'),
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: ({ location }) => ({
          location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
        }),
        toModelOutput: ({ input, output, toolCallId }) => {
          toModelOutputArgs.push({ input, output, toolCallId });
          return {
            type: 'text',
            value: `The weather in ${input.location} is ${output.temperature} degrees Fahrenheit.`,
          };
        },
      }),
    },
    stopWhen: stepCountIs(5),
    prompt: 'What is the weather in Tokyo?',
  });

  for await (const uiMessage of readUIMessageStream({
    stream: result.toUIMessageStream(),
  })) {
    console.clear();
    console.log(JSON.stringify(uiMessage, null, 2));
  }

  console.log(JSON.stringify(toModelOutputArgs, null, 2));
});
