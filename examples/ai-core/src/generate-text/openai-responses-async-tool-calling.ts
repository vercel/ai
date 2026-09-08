import {
  openai,
  type OpenAIResponsesProviderOptions,
  type OpenAIToolOptions,
} from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

const model = openai.responses('gpt-6-astra');

const tools = {
  get_weather: tool({
    description: 'Read a demo weather snapshot for a city.',
    inputSchema: z.object({
      city: z.string(),
    }),
    outputSchema: z.object({
      city: z.string(),
      temperatureC: z.number(),
      condition: z.string(),
      source: z.string(),
    }),
    providerOptions: {
      openai: {
        async: true,
      } satisfies OpenAIToolOptions,
    },
  }),
};

async function getWeather(city: string) {
  // Simulate an application-managed background job.
  await new Promise(resolve => setTimeout(resolve, 3_000));

  if (city !== 'Paris') {
    throw new Error(`No demo weather snapshot for ${city}.`);
  }

  return {
    city,
    temperatureC: 22,
    condition: 'Clear',
    source: 'demo weather snapshot',
  };
}

run(async () => {
  const firstResult = await generateText({
    model,
    tools,
    system:
      'Start the weather lookup and answer the independent packing question ' +
      'without waiting. Use the demo weather result when it arrives; never invent it.',
    prompt:
      'Check the demo weather snapshot for Paris. Meanwhile, list three essentials for any city trip.',
  });

  console.log('First response content:');
  console.log(JSON.stringify(firstResult.content, null, 2));

  const call = firstResult.toolCalls[0];
  if (
    call == null ||
    call.dynamic ||
    call.toolName !== 'get_weather' ||
    call.input.city !== 'Paris'
  ) {
    throw new Error('The response did not include the expected weather call.');
  }

  const previousResponseId = firstResult.providerMetadata?.openai
    ?.responseId as string | undefined;
  if (previousResponseId == null) {
    throw new Error('OpenAI did not return a response ID.');
  }

  // The application owns and executes the job. Other conversation turns could
  // happen before this promise resolves.
  const weather = await getWeather(call.input.city);

  const finalResult = await generateText({
    model,
    tools,
    messages: [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            output: { type: 'json', value: weather },
          },
        ],
      },
    ],
    providerOptions: {
      openai: {
        previousResponseId,
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  console.log('\nFinal response content:');
  console.log(JSON.stringify(finalResult.content, null, 2));
});
