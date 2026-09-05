import { groq } from '@ai-sdk/groq';
import { Output, generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';

const expectedProviderError =
  'json mode cannot be combined with tool/function calling';
const reproductionSignal =
  'ISSUE_10023_REPRODUCED: generateText with experimental_output and tools was rejected by Groq';

async function main() {
  let toolExecutions = 0;

  try {
    const result = await generateText({
      model: groq('openai/gpt-oss-120b'),
      system:
        'Use resolveDate for relative dates, then return the schedule matching the schema.',
      prompt: 'Tomorrow prepare the AI SDK issue reproduction.',
      tools: {
        resolveDate: tool({
          description: 'Convert a relative date expression into an ISO date.',
          inputSchema: z.object({ input: z.string() }),
          execute: async () => {
            toolExecutions += 1;
            return { date: '2026-09-04' };
          },
        }),
      },
      prepareStep: ({ stepNumber }) =>
        stepNumber === 0
          ? {
              toolChoice: {
                type: 'tool' as const,
                toolName: 'resolveDate' as const,
              },
            }
          : {},
      experimental_output: Output.object({
        schema: z.array(
          z.object({
            name: z.string(),
            date: z.string().nullable(),
          }),
        ),
      }),
      stopWhen: stepCountIs(5),
    });

    const output = result.experimental_output;

    if (toolExecutions < 1) {
      throw new Error('Expected resolveDate to execute before object output.');
    }
    if (output.length < 1 || output[0].date !== '2026-09-04') {
      throw new Error(
        'Expected a schema-valid schedule using the tool result.',
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes(expectedProviderError)) {
      console.error(reproductionSignal);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

main();
