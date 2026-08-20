import { readFileSync } from 'node:fs';

import { createMistral } from '@ai-sdk/mistral';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

const incrementalToolCallChunks = readFileSync(
  new URL(
    '../../../../packages/mistral/src/__fixtures__/mistral-incremental-tool-call.chunks.txt',
    import.meta.url,
  ),
  'utf8',
)
  .trim()
  .split('\n')
  .map(line => `data: ${line}\n\n`)
  .concat('data: [DONE]\n\n')
  .join('');

const finalTextChunks = [
  {
    id: 'response-after-tool',
    object: 'chat.completion.chunk',
    created: 1787244949,
    model: 'zai-glm-5-2',
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: 'Tool complete.' },
        finish_reason: null,
      },
    ],
  },
  {
    id: 'response-after-tool',
    object: 'chat.completion.chunk',
    created: 1787244949,
    model: 'zai-glm-5-2',
    choices: [
      {
        index: 0,
        delta: { content: '' },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 180,
      completion_tokens: 3,
      total_tokens: 183,
    },
  },
]
  .map(chunk => `data: ${JSON.stringify(chunk)}\n\n`)
  .concat('data: [DONE]\n\n')
  .join('');

async function main() {
  let requestCount = 0;
  const model = createMistral({
    apiKey: 'test-api-key',
    fetch: async () => {
      requestCount += 1;
      return new Response(
        requestCount === 1 ? incrementalToolCallChunks : finalTextChunks,
        { headers: { 'content-type': 'text/event-stream' } },
      );
    },
  })('zai-glm-5-2');

  const executedQueries: string[] = [];
  const streamErrors: unknown[] = [];

  const result = streamText({
    model,
    messages: [
      {
        role: 'user',
        content: 'search the web for the current berlin weather',
      },
    ],
    tools: {
      webSearchTool: tool({
        description: 'Search the web',
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => {
          executedQueries.push(query);
          return { results: [query] };
        },
      }),
    },
    toolChoice: 'auto',
    stopWhen: stepCountIs(5),
  });

  for await (const part of result.fullStream) {
    if (part.type === 'error') {
      streamErrors.push(part.error);
    }
  }

  const expectedQuery = 'current Berlin weather';
  const toolExecutedWithAccumulatedInput =
    executedQueries.length === 1 && executedQueries[0] === expectedQuery;

  if (!toolExecutedWithAccumulatedInput || streamErrors.length > 0) {
    console.error(
      'ISSUE_19178_REPRODUCED: streaming tool call was not executed with accumulated arguments',
    );
    console.error(
      JSON.stringify({
        executedQueries,
        streamErrorNames: streamErrors.map(error =>
          error instanceof Error ? error.name : typeof error,
        ),
      }),
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'ISSUE_19178_FIXED: streaming tool call executed once with accumulated arguments and no stream errors',
  );
}

main().catch(error => {
  console.error('REPRODUCTION_SETUP_FAILED', error);
  process.exitCode = 2;
});
