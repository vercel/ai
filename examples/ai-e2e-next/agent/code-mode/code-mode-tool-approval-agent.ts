import { experimental_codeModeTool as codeModeTool } from '@ai-sdk/code-mode';
import { ToolLoopAgent, tool, type InferAgentUIMessage } from 'ai';
import { z } from 'zod';

const getProductPrice = tool({
  description: 'Get the unit price of a product.',
  inputSchema: z.object({
    productId: z.string(),
  }),
  outputSchema: z.object({
    productId: z.string(),
    unitPrice: z.number(),
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
  outputSchema: z.object({
    confirmationId: z.string(),
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
  codeMode: codeModeTool(),
  getProductPrice,
  purchaseProduct,
} as const;

export const codeModeToolApprovalAgent = new ToolLoopAgent({
  model: 'openai/gpt-5.6-sol',
  instructions:
    'You are a purchasing assistant. Use code mode to coordinate the available tools. ' +
    'When the user asks to buy a product, look up its price, calculate the total, and purchase it. ',
  tools,
  onStepEnd: result => {
    console.log(JSON.stringify(result.content, null, 2));
  },
  experimental_toolCallers: {
    getProductPrice: ['codeMode'],
    purchaseProduct: ['codeMode'],
  },
  toolApproval: {
    codeMode: 'user-approval',
    getProductPrice: 'user-approval',
    purchaseProduct: 'user-approval',
  },
});

export type CodeModeToolApprovalMessage = InferAgentUIMessage<
  typeof codeModeToolApprovalAgent
>;
