import { anthropic, AnthropicMessageMetadata } from '@ai-sdk/anthropic';
import { streamText, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  let stepIndex = 0;

  const result = streamText({
    model: anthropic('claude-sonnet-4-5'),
    stopWhen: stepCountIs(10),
    prompt:
      'Get the current weather for Tokyo, Sydney, and London. ' +
      'Then calculate the average temperature across all three cities.',
    tools: {
      code_execution: anthropic.tools.codeExecution_20250825(),

      getWeather: tool({
        description:
          'Get current weather data for a city. ' +
          'Returns temperature in Celsius and weather condition.',
        inputSchema: z.object({
          city: z.string().describe('Name of the city'),
        }),
        execute: async ({ city }) => {
          console.log('Getting weather for:', city);
          // Simulated weather data
          const weatherData: Record<
            string,
            { temp: number; condition: string }
          > = {
            Tokyo: { temp: 22, condition: 'Partly Cloudy' },
            Sydney: { temp: 28, condition: 'Sunny' },
            London: { temp: 14, condition: 'Rainy' },
          };
          return (
            weatherData[city] || { temp: 20, condition: 'Unknown location' }
          );
        },
        providerOptions: {
          anthropic: {
            allowedCallers: ['code_execution_20250825'],
          },
        },
      }),
    },

    // Propagate container ID between steps for code execution continuity
    prepareStep: ({ steps }) => {
      if (steps.length === 0) {
        return undefined;
      }

      const lastStep = steps[steps.length - 1];
      const containerId = (
        lastStep.providerMetadata?.anthropic as
          | AnthropicMessageMetadata
          | undefined
      )?.container?.id;

      if (!containerId) {
        return undefined;
      }

      return {
        providerOptions: {
          anthropic: {
            container: { id: containerId },
          },
        },
      };
    },

    // Log request at each step (response body not available in streaming)
    onStepFinish: async ({ request, response, text }) => {
      stepIndex++;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`STEP ${stepIndex}`);
      console.log(`${'='.repeat(60)}`);

      console.log('\nRequest body:');
      console.log(JSON.stringify(request.body, null, 2));

      console.log('\nResponse:');
      console.log(JSON.stringify(response, null, 2));
    },
  });

  // Stream the text output
  process.stdout.write('\nStreaming: ');
  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  // Wait for all promises to resolve
  const [text, steps] = await Promise.all([result.text, result.steps]);

  console.log(`\n\n${'='.repeat(60)}`);
  console.log('FINAL RESULT');
  console.log(`${'='.repeat(60)}`);
  console.log('Text:', text);
  console.log('Steps:', steps.length);
});
