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

const checkProductInventory = tool({
  description: 'Check how many units of a product are currently in stock.',
  inputSchema: z.object({
    productId: z.string(),
  }),
  outputSchema: z.object({
    productId: z.string(),
    availableQuantity: z.number(),
  }),
  execute: async ({ productId }) => ({
    productId,
    availableQuantity: 10,
  }),
});

const getCustomerDiscount = tool({
  description: 'Get the discount percentage available to a customer.',
  inputSchema: z.object({
    customerId: z.string(),
  }),
  outputSchema: z.object({
    customerId: z.string(),
    discountPercentage: z.number(),
  }),
  execute: async ({ customerId }) => ({
    customerId,
    discountPercentage: 10,
  }),
});

const getShippingCost = tool({
  description: 'Get the shipping cost for a product quantity and postal code.',
  inputSchema: z.object({
    productId: z.string(),
    quantity: z.number(),
    postalCode: z.string(),
  }),
  outputSchema: z.object({
    productId: z.string(),
    shippingCost: z.number(),
  }),
  execute: async ({ productId }) => ({
    productId,
    shippingCost: 8,
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
  checkProductInventory,
  getCustomerDiscount,
  getShippingCost,
  purchaseProduct,
} as const;

export const codeModeToolApprovalAgent = new ToolLoopAgent({
  model: 'openai/gpt-5.6-sol',
  instructions: 'You are a purchasing assistant',
  tools,
  onStepEnd: result => {
    console.log(JSON.stringify(result.content, null, 2));
  },
  experimental_toolCallers: {
    getProductPrice: ['codeMode'],
    checkProductInventory: ['codeMode'],
    getCustomerDiscount: ['codeMode'],
    getShippingCost: ['codeMode'],
    purchaseProduct: ['codeMode'],
  },
  toolApproval: {
    codeMode: 'user-approval',
    getProductPrice: 'user-approval',
    checkProductInventory: 'user-approval',
    getCustomerDiscount: 'approved',
    getShippingCost: 'user-approval',
    purchaseProduct: 'approved',
  },
});

export type CodeModeToolApprovalMessage = InferAgentUIMessage<
  typeof codeModeToolApprovalAgent
>;
