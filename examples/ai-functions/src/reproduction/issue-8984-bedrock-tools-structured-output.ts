import { randomUUID } from 'node:crypto';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, Output, stepCountIs, tool } from 'ai';
import { z } from 'zod';

async function main() {
  const secret = `issue-8984-${randomUUID()}`;
  let toolExecutionCount = 0;

  const result = await generateText({
    model: bedrock('us.anthropic.claude-sonnet-4-5-20250929-v1:0'),
    stopWhen: stepCountIs(3),
    experimental_output: Output.object({
      schema: z.object({
        secret: z.string(),
        toolWasUsed: z.boolean(),
      }),
    }),
    tools: {
      getPrivateSecret: tool({
        description:
          'Returns the private secret required to answer the request. The secret cannot be inferred without calling this tool.',
        inputSchema: z.object({}),
        execute: async () => {
          toolExecutionCount += 1;
          return { secret };
        },
      }),
    },
    prompt:
      'Call getPrivateSecret exactly once. Then return its exact secret in the structured output and set toolWasUsed to true. Never guess or invent the secret.',
  });

  const warnings = result.steps.flatMap(step => step.warnings);
  const toolCalls = result.steps.flatMap(step => step.toolCalls);
  const toolResults = result.steps.flatMap(step => step.toolResults);

  if (toolExecutionCount !== 1) {
    throw new Error(
      `ISSUE_8984_REPRODUCED: expected the tool to execute once, but it executed ${toolExecutionCount} times`,
    );
  }

  if (toolCalls.length !== 1 || toolResults.length !== 1) {
    throw new Error(
      `ISSUE_8984_REPRODUCED: expected one tool call and one tool result, but received ${toolCalls.length} calls and ${toolResults.length} results`,
    );
  }

  if (
    result.experimental_output.secret !== secret ||
    result.experimental_output.toolWasUsed !== true
  ) {
    throw new Error(
      'ISSUE_8984_REPRODUCED: structured output did not contain the private tool result',
    );
  }

  const ignoredToolsWarning = warnings.find(warning =>
    JSON.stringify(warning).includes(
      'JSON response format does not support tools',
    ),
  );

  if (ignoredToolsWarning != null) {
    throw new Error(
      `ISSUE_8984_REPRODUCED: tools were reported as ignored: ${JSON.stringify(ignoredToolsWarning)}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        model: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        steps: result.steps.length,
        toolExecutionCount,
        toolCallCount: toolCalls.length,
        toolResultCount: toolResults.length,
        structuredOutputContainsPrivateToolResult:
          result.experimental_output.secret === secret,
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
