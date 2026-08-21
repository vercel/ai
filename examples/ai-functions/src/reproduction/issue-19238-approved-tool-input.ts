import { generateText, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

async function main() {
  let modelCalled = false;
  let repairAttempted = false;

  try {
    const result = await generateText({
      model: new MockLanguageModelV4({
        doGenerate: async () => {
          modelCalled = true;
          return {
            content: [{ type: 'text', text: 'Recovered turn.' }],
            finishReason: { raw: 'stop', unified: 'stop' },
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
          };
        },
      }),
      tools: {
        createInvoice: tool({
          inputSchema: z.object({ amount: z.number() }),
          execute: async ({ amount }) => ({ amount }),
        }),
      },
      toolApproval: { createInvoice: 'user-approval' },
      repairToolCall: async ({ toolCall }) => {
        repairAttempted = true;
        return {
          ...toolCall,
          input: JSON.stringify({ amount: 42 }),
        };
      },
      messages: [
        { role: 'user', content: 'Create an invoice.' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'createInvoice',
              input: { amount: 'not-a-number' },
            },
            {
              type: 'tool-approval-request',
              approvalId: 'approval-1',
              toolCallId: 'call-1',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-approval-response',
              approvalId: 'approval-1',
              approved: true,
            },
          ],
        },
      ],
    });

    if (!modelCalled || result.text !== 'Recovered turn.') {
      throw new Error('The approved tool call did not recover the turn.');
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Invalid input for tool createInvoice') &&
      !repairAttempted
    ) {
      console.error(
        'ISSUE #19238 REPRODUCED: approved invalid tool input killed the turn before recovery',
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

main();
