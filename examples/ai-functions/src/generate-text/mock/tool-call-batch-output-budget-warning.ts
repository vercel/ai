import { generateText, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'lookup',
            input: '{"query":"first"}',
          },
          {
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'lookup',
            input: '{"query":"second"}',
          },
        ],
        finishReason: { raw: 'length', unified: 'length' },
        usage: {
          inputTokens: {
            total: 12,
            noCache: 12,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 32,
            text: 32,
            reasoning: undefined,
          },
        },
        warnings: [],
      }),
    }),
    tools: {
      lookup: tool({
        inputSchema: z.object({ query: z.string() }),
      }),
    },
    maxOutputTokens: 32,
    prompt: 'Look up both items.',
  });

  const budgetWarning = result.warnings?.find(
    warning => warning.type === 'tool-call-batch-output-budget',
  );

  if (budgetWarning != null) {
    console.log('Tool-call batch output budget warning:', budgetWarning);
  }
});
