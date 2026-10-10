import { generateText, tool, toolSearch } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'search-call',
            toolName: 'search',
            input: JSON.stringify({ query: 'request' }),
          },
        ],
        finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
        usage: {
          inputTokens: {
            total: 1,
            noCache: 1,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 1,
            text: 1,
            reasoning: undefined,
          },
        },
        warnings: [],
      },
    }),
    tools: {
      search: toolSearch(),
      HTTPRequest: tool({
        deferLoading: true,
        inputSchema: z.object({}),
        execute: async () => 'request complete',
      }),
      getHTTPStatus: tool({
        deferLoading: true,
        inputSchema: z.object({}),
        execute: async () => 200,
      }),
    },
    prompt: 'Find the request tool.',
  });

  console.dir(result.toolResults[0].output, { depth: null });
});
