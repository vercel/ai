import { anthropic } from '@ai-sdk/anthropic';
import { generateText, Output, stepCountIs, tool } from 'ai';
import { z } from 'zod';

const reportedWarning =
  'The "tools" setting is not supported by this model - JSON response format does not support tools. The provided tools are ignored.';

async function main() {
  let toolCallCount = 0;

  const result = await generateText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    experimental_output: Output.object({
      schema: z.object({
        weather: z.string().describe('The weather for the given city'),
      }),
    }),
    system:
      'You are a weather assistant. You are given a city and you need to return the weather for that city. Always call getWeather before answering and use its result verbatim.',
    prompt: 'What is the weather in Tokyo?',
    tools: {
      getWeather: tool({
        description: 'Get the weather for a given city',
        inputSchema: z.object({
          city: z.string().describe('The city to get the weather for'),
        }),
        execute: async ({ city }) => {
          toolCallCount++;
          return `The weather in ${city} is sunny`;
        },
      }),
    },
    stopWhen: stepCountIs(3),
  });

  const warnings = result.steps.flatMap(step => step.warnings ?? []);
  const warningText = JSON.stringify(warnings);

  if (warningText.includes(reportedWarning)) {
    throw new Error(`ISSUE_REPRODUCED: ${reportedWarning}`);
  }

  if (toolCallCount !== 1) {
    throw new Error(
      `ISSUE_REPRODUCED: expected getWeather to execute once, executed ${toolCallCount} times`,
    );
  }

  const expectedWeather = 'The weather in Tokyo is sunny';
  if (result.output.weather !== expectedWeather) {
    throw new Error(
      `ISSUE_REPRODUCED: expected structured output weather ${JSON.stringify(expectedWeather)}, received ${JSON.stringify(result.output.weather)}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        model: 'claude-sonnet-4-5-20250929',
        toolCallCount,
        output: result.output,
        warnings,
        requestBodies: result.steps.map(step => step.request.body),
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
