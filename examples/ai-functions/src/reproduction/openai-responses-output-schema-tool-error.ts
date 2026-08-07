import { createOpenAI } from '@ai-sdk/openai';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';

const bugSignal =
  'ISSUE_18590_REPRODUCED: OpenAI rejected the thrown tool error because function_call_output.output was not a JSON string.';

async function main() {
  const withoutOutputSchema = process.env.WITHOUT_OUTPUT_SCHEMA === '1';

  try {
    const result = await generateText({
      model: createOpenAI().responses('gpt-4.1'),
      prompt: "What's the weather in London? Use the tool.",
      stopWhen: stepCountIs(3),
      tools: {
        get_weather: tool({
          description: 'Get the current weather for a city.',
          inputSchema: z.object({ city: z.string() }),
          execute: async (): Promise<{
            temperatureC: number;
            conditions: string;
          }> => {
            throw new Error(
              'WeatherServiceError: upstream returned 503 (service unavailable)',
            );
          },
          ...(withoutOutputSchema
            ? {}
            : {
                providerOptions: {
                  openai: {
                    outputSchema: {
                      type: 'object',
                      properties: {
                        temperatureC: { type: 'number' },
                        conditions: { type: 'string' },
                      },
                      required: ['temperatureC', 'conditions'],
                      additionalProperties: false,
                    },
                  },
                },
              }),
        }),
      },
    });

    console.log(
      `Request completed with output_schema=${!withoutOutputSchema}; steps=${result.steps.length}.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes('Invalid function_call_output.output') &&
      message.includes('expected a JSON string') &&
      message.includes('output_schema')
    ) {
      console.error(bugSignal);
      console.error(message);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

main();
