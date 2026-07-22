import { anthropic } from '@ai-sdk/anthropic';
import { generateText, Output, stepCountIs, tool } from 'ai';
import { z } from 'zod';

const reportedWarning =
  'The "tools" setting is not supported by this model - JSON response format does not support tools. The provided tools are ignored.';

async function main() {
  let toolExecutionCount = 0;

  const result = await generateText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    system:
      'You are a weather assistant. You must call getWeather before answering, then return the tool result as structured output.',
    prompt: 'What is the weather in Tokyo?',
    tools: {
      getWeather: tool({
        description: 'Get the weather for a given city',
        inputSchema: z.object({
          city: z.string().describe('The city to get the weather for'),
        }),
        execute: async ({ city }) => {
          toolExecutionCount++;
          return `The weather in ${city} is sunny`;
        },
      }),
    },
    output: Output.object({
      schema: z.object({
        weather: z.string().describe('The weather for the given city'),
      }),
    }),
    stopWhen: stepCountIs(3),
    maxOutputTokens: 512,
  });

  const warnings = result.steps.flatMap(step => step.warnings ?? []);
  const warningText = JSON.stringify(warnings);

  if (warningText.includes(reportedWarning)) {
    throw new Error(`ISSUE_10372_REPRODUCED: ${reportedWarning}`);
  }

  if (toolExecutionCount === 0) {
    throw new Error(
      'ISSUE_10372_REPRODUCED: getWeather was ignored and never executed.',
    );
  }

  if (!result.output.weather.toLowerCase().includes('sunny')) {
    throw new Error(
      `ISSUE_10372_REPRODUCED: structured output did not use the tool result: ${JSON.stringify(result.output)}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        status: 'issue not reproduced',
        model: 'claude-sonnet-4-5-20250929',
        toolExecutionCount,
        output: result.output,
        warnings,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
