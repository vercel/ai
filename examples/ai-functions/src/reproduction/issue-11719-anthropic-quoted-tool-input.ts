import { anthropic } from '@ai-sdk/anthropic';
import { generateText, streamText, tool } from 'ai';
import { z } from 'zod';

const expectedDescription =
  'Today Strava logs the run, but it does not answer: "What should I do next after this run?".';

function createOptions(onExecute: (description: string | undefined) => void) {
  return {
    model: anthropic('claude-sonnet-4-5'),
    toolChoice: {
      type: 'tool' as const,
      toolName: 'website_update' as const,
    },
    tools: {
      website_update: tool({
        description: 'Update a website from a list of tasks.',
        inputSchema: z.object({
          website_path: z.string(),
          tasks: z.array(
            z.object({
              description: z.string(),
              type: z.enum(['feature', 'bug']),
              passes: z.boolean(),
            }),
          ),
        }),
        execute: async input => {
          onExecute(input.tasks[0]?.description);
          return { updated: true };
        },
      }),
    },
    prompt: [
      'Call website_update exactly once.',
      'Use website_path "/home/user/pace-landing".',
      'Include exactly one feature task with passes false.',
      `Use this task description verbatim, including its double quotes: ${expectedDescription}`,
    ].join('\n'),
  };
}

function assertExecuted(mode: string, executedDescription: string | undefined) {
  if (executedDescription !== expectedDescription) {
    throw new Error(
      `ISSUE_11719_REPRODUCED: ${mode} quoted tool input did not execute with the expected value; received ${JSON.stringify(executedDescription)}`,
    );
  }
}

async function testGenerateText() {
  let executedDescription: string | undefined;
  const result = await generateText(
    createOptions(description => {
      executedDescription = description;
    }),
  );

  const invalidToolCall = result.toolCalls.find(toolCall => toolCall.invalid);
  if (invalidToolCall != null) {
    throw new Error(
      `ISSUE_11719_REPRODUCED: generateText quoted tool input was rejected: ${invalidToolCall.error}`,
    );
  }

  assertExecuted('generateText', executedDescription);
}

async function testStreamText() {
  let executedDescription: string | undefined;
  const result = streamText(
    createOptions(description => {
      executedDescription = description;
    }),
  );
  let invalidToolCallError: unknown;
  for await (const part of result.fullStream) {
    if (part.type === 'tool-call' && part.invalid) {
      invalidToolCallError = part.error;
    }
  }

  if (invalidToolCallError != null) {
    throw new Error(
      `ISSUE_11719_REPRODUCED: streamText quoted tool input was rejected: ${invalidToolCallError}`,
    );
  }

  assertExecuted('streamText', executedDescription);
}

async function main() {
  await testGenerateText();
  await testStreamText();

  console.log(
    'ISSUE_11719_NOT_REPRODUCED: quoted tool input parsed and executed successfully with generateText and streamText.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
