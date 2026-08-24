import {
  generateText,
  InvalidToolInputError,
  type ModelMessage,
  tool,
} from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

const usage = {
  inputTokens: {
    total: 10,
    noCache: 10,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 10,
    text: 10,
    reasoning: undefined,
  },
};

const createInvoice = tool({
  inputSchema: z.object({ amount: z.number() }),
  needsApproval: true,
  execute: async ({ amount }) => ({ amount }),
});

async function verifyInvalidGeneratedCallsAreNotApproved() {
  const result = await generateText({
    model: new MockLanguageModelV3({
      doGenerate: async () => ({
        warnings: [],
        usage,
        finishReason: { raw: undefined, unified: 'tool-calls' },
        content: [
          {
            type: 'tool-call',
            toolCallId: 'generated-call',
            toolName: 'createInvoice',
            input: JSON.stringify({ amount: 'not-a-number' }),
          },
        ],
      }),
    }),
    tools: { createInvoice },
    prompt: 'Create an invoice.',
  });

  if (result.content.some(part => part.type === 'tool-approval-request')) {
    throw new Error(
      'Invalid model-generated tool input unexpectedly reached an approval request.',
    );
  }
}

async function main() {
  await verifyInvalidGeneratedCallsAreNotApproved();

  let repairCalled = false;
  let modelCalled = false;

  const approvedHistory: ModelMessage[] = [
    { role: 'user', content: 'Create an invoice.' },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'approved-call',
          toolName: 'createInvoice',
          input: { amount: 'not-a-number' },
        },
        {
          type: 'tool-approval-request',
          approvalId: 'approval-1',
          toolCallId: 'approved-call',
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
  ];

  try {
    await generateText({
      model: new MockLanguageModelV3({
        doGenerate: async () => {
          modelCalled = true;
          return {
            warnings: [],
            usage,
            finishReason: { raw: undefined, unified: 'stop' },
            content: [{ type: 'text', text: 'Recovered.' }],
          };
        },
      }),
      tools: { createInvoice },
      messages: approvedHistory,
      experimental_repairToolCall: async ({ toolCall }) => {
        repairCalled = true;
        return {
          ...toolCall,
          input: JSON.stringify({ amount: 100 }),
        };
      },
    });
  } catch (error) {
    if (InvalidToolInputError.isInstance(error)) {
      console.error(
        'ISSUE_19238_REPRODUCED: approved invalid tool input terminated the resumed turn with InvalidToolInputError before repair or model recovery',
      );
      console.error(`repairCalled=${repairCalled} modelCalled=${modelCalled}`);
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  if (!repairCalled && !modelCalled) {
    throw new Error(
      'The resumed turn returned without repair or model-visible recovery.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
