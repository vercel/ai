import { experimental_codeModeTool as codeModeTool } from '@ai-sdk/code-mode';
import {
  generateText,
  isStepCount,
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
      const result = await generateText({
        model: 'moonshotai/kimi-k3',
        tools,
        experimental_toolCallers: {
          getProductPrice: ['code_mode'],
          purchaseProduct: ['code_mode'],
        },
        toolApproval: {
          code_mode: 'user-approval',
          purchaseProduct: 'user-approval',
        },
        stopWhen: isStepCount(10),
        messages,
      });

      messages.push(...result.responseMessages);
      console.log(JSON.stringify(result.content, null, 2));

      const approvals: ToolApprovalResponse[] = [];
      for (const part of result.content) {
        if (part.type === 'text') {
          process.stdout.write(`\nAssistant:\n${part.text}\n`);
        }

        if (part.type === 'tool-approval-request' && !part.isAutomatic) {
          const answer = await terminal.question(
            `Approve ${part.toolCall.toolName} with this input?\n\n${JSON.stringify(part.toolCall.input, null, 2)}\n\n(y/n)? `,
          );
          approvals.push({
            type: 'tool-approval-response',
            approvalId: part.approvalId,
            approved:
              answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes',
          });
        }
      }

      if (approvals.length === 0) {
        break;
      }
      messages.push({ role: 'tool', content: approvals });
    }
  } finally {
    terminal.close();
  }
});
