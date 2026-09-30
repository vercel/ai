import {
  openai,
  type OpenAIResponsesProviderOptions,
  type OpenAIToolOptions,
} from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { printFullStream } from '../lib/print-full-stream';
import { run } from '../lib/run';

const model = openai.responses('gpt-6-astra');

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

const weatherJobs = new Map<string, ReturnType<typeof getWeather>>();

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
    onInputAvailable({ input, toolCallId }) {
      // This runs as soon as the complete streamed tool call arrives. Starting
      // the promise here lets the job overlap subsequent model output.
      weatherJobs.set(toolCallId, getWeather(input.city));
    },
  }),
};

run(async () => {
  const firstResult = streamText({
    model,
    tools,
    system:
      'Start the weather lookup and answer the independent packing question ' +
      'without waiting. Use the demo weather result when it arrives; never invent it.',
    prompt:
      'Check the demo weather snapshot for Paris. Meanwhile, list three essentials for any city trip.',
  });

  console.log('First response:');
  await printFullStream({ result: firstResult });

  const call = (await firstResult.toolCalls)[0];
  if (
    call == null ||
    call.dynamic ||
    call.toolName !== 'get_weather' ||
    call.input.city !== 'Paris'
  ) {
    throw new Error('The response did not include the expected weather call.');
  }

  const previousResponseId = (await firstResult.providerMetadata)?.openai
    ?.responseId as string | undefined;
  if (previousResponseId == null) {
    throw new Error('OpenAI did not return a response ID.');
  }

  const weatherJob = weatherJobs.get(call.toolCallId);
  if (weatherJob == null) {
    throw new Error('The weather job was not started.');
  }
  const weather = await weatherJob;

  const finalResult = streamText({
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

  console.log('\nResponse after the weather job completes:');
  await printFullStream({ result: finalResult });
});
