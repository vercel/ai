import { createAzure } from '@ai-sdk/azure';
import { NoSuchToolError, streamText, tool } from 'ai';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const failureSignal =
  'ISSUE_19067_REPRODUCED: the parallel wrapper was rejected with NoSuchToolError and its declared nested tool calls were discarded';

async function main() {
  const fixture = await readFile(
    new URL(
      '../../../../packages/openai/src/responses/__fixtures__/issue-19067-parallel-tool-call-wrapper.chunks.txt',
      import.meta.url,
    ),
    'utf8',
  );
  const body = `${fixture
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => `data: ${line}\n\n`)
    .join('')}data: [DONE]\n\n`;

  const azure = createAzure({
    resourceName: 'fixture',
    apiKey: 'fixture',
    fetch: async () =>
      new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
  });

  const executedTools: string[] = [];
  const result = streamText({
    model: azure.responses('gpt-5.4'),
    prompt: 'Use the declared tools.',
    tools: {
      weather: tool({
        inputSchema: z.object({ location: z.string() }),
        execute: async () => {
          executedTools.push('weather');
          return 'weather result';
        },
      }),
      cityAttractions: tool({
        inputSchema: z.object({ city: z.string() }),
        execute: async () => {
          executedTools.push('cityAttractions');
          return 'attractions result';
        },
      }),
    },
  });

  for await (const _part of result.fullStream) {
    // Consume the stream so tool-call parsing and tool execution complete.
  }

  const steps = await result.steps;
  const toolCalls = steps.flatMap(step => step.toolCalls);
  const rejectedWrapper = toolCalls.find(
    toolCall =>
      toolCall.toolName === 'parallel' &&
      toolCall.invalid === true &&
      NoSuchToolError.isInstance(toolCall.error),
  );

  if (rejectedWrapper != null && executedTools.length === 0) {
    console.error(failureSignal);
    process.exitCode = 1;
    return;
  }

  const sortedExecutedTools = [...executedTools].sort();
  const expectedTools = ['cityAttractions', 'weather'];
  if (JSON.stringify(sortedExecutedTools) !== JSON.stringify(expectedTools)) {
    throw new Error(
      `Expected both nested tools to execute, received ${JSON.stringify(sortedExecutedTools)}.`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
