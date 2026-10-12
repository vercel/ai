import { generateText, tool, type ModelMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

const messages: ModelMessage[] = [
  { role: 'user', content: 'Archive report Q3.' },
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'archive-call',
        toolName: 'archiveReport',
        input: { reportId: 'Q3' },
      },
      {
        type: 'tool-approval-request',
        approvalId: 'approval-archive-call',
        toolCallId: 'archive-call',
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-approval-response',
        approvalId: 'approval-archive-call',
        approved: true,
        reason: 'Approved during the quarterly records review.',
      },
    ],
  },
];

run(async () => {
  const result = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'The report was archived.' }],
        finishReason: { raw: undefined, unified: 'stop' },
        usage: {
          inputTokens: {
            total: 10,
            noCache: 10,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 6,
            text: 6,
            reasoning: undefined,
          },
        },
        warnings: [],
      }),
    }),
    messages,
    tools: {
      archiveReport: tool({
        inputSchema: z.object({ reportId: z.string() }),
        execute: async ({ reportId }, { toolCallId, approval }) => {
          console.log({
            toolCallId,
            reportId,
            approvalId: approval?.approvalId,
            approvalReason: approval?.reason,
          });

          return { archived: true };
        },
      }),
    },
    toolApproval: {
      archiveReport: 'user-approval',
    },
  });

  console.log(result.text);
});
