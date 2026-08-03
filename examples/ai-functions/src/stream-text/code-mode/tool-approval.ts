import { experimental_codeModeTool as codeModeTool } from '@ai-sdk/code-mode';
import {
  isStepCount,
  streamText,
  tool,
  type ModelMessage,
  type ToolApprovalResponse,
} from 'ai';
import * as readline from 'node:readline/promises';
import { z } from 'zod';
import { run } from '../../lib/run';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const getProductPrice = tool({
  description: 'Get the unit price of a product.',
  inputSchema: z.object({
    productId: z.string(),
  }),
  execute: async ({ productId }) => ({
    productId,
    unitPrice: 25,
  }),
});

const purchaseProduct = tool({
  description: 'Purchase a quantity of a product for the provided total.',
  inputSchema: z.object({
    productId: z.string(),
    quantity: z.number(),
    total: z.number(),
  }),
  execute: async ({ productId, quantity, total }) => ({
    confirmationId: 'order_123',
    productId,
    quantity,
    total,
  }),
});

const tools = {
  code_mode: codeModeTool(),
  getProductPrice,
  purchaseProduct,
} as const;

run(async () => {
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content:
        'I want to purchase 2 units of product sku_123. Look up its price, calculate the total, then purchase it.',
    },
  ];

  try {
    while (true) {
      const result = streamText({
        model: 'moonshotai/kimi-k3',
        tools,
        experimental_toolCallers: ({ code_mode }) => ({
          getProductPrice: [code_mode],
          purchaseProduct: [code_mode],
        }),
        toolApproval: {
          code_mode: 'user-approval',
          purchaseProduct: 'user-approval',
        },
        stopWhen: isStepCount(10),
        messages,
      });

      const approvals: ToolApprovalResponse[] = [];
      for await (const chunk of result.stream) {
        if (chunk.type === 'text-start') {
          process.stdout.write('\nAssistant:\n');
        } else if (chunk.type === 'text-delta') {
          process.stdout.write(chunk.text);
        } else if (
          chunk.type === 'tool-approval-request' &&
          !chunk.isAutomatic
        ) {
          const answer = await terminal.question(
            `\nApprove ${chunk.toolCall.toolName} with this input?\n\n${JSON.stringify(chunk.toolCall.input, null, 2)}\n\n(y/n)? `,
          );
          approvals.push({
            type: 'tool-approval-response',
            approvalId: chunk.approvalId,
            approved:
              answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes',
          });
        }
      }
      process.stdout.write('\n');

      messages.push(...(await result.responseMessages));
      if (approvals.length === 0) {
        break;
      }
      messages.push({ role: 'tool', content: approvals });
    }
  } finally {
    terminal.close();
  }
});
