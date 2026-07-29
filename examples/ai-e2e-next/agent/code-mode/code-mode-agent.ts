import { experimental_createCodeModeTool as createCodeModeTool } from '@ai-sdk/code-mode';
import { ToolLoopAgent, tool, type InferAgentUIMessage } from 'ai';
import { z } from 'zod';

const getInventory = tool({
  description: 'Get the available inventory for a product.',
  inputSchema: z.object({
    productId: z.string(),
  }),
  outputSchema: z.object({
    productId: z.string(),
    availableUnits: z.number(),
  }),
  execute: async ({ productId }) => ({
    productId,
    availableUnits: 42,
  }),
});

const getDemand = tool({
  description: 'Get the requested units for a product.',
  inputSchema: z.object({
    productId: z.string(),
  }),
  outputSchema: z.object({
    productId: z.string(),
    requestedUnits: z.number(),
  }),
  execute: async ({ productId }) => ({
    productId,
    requestedUnits: 31,
  }),
});

const codeMode = createCodeModeTool(
  {
    getInventory,
    getDemand,
  },
  {
    executionPolicy: {
      timeoutMs: 30_000,
      memoryLimitBytes: 64 * 1024 * 1024,
    },
  },
);

export const codeModeAgent = new ToolLoopAgent({
  model: 'moonshotai/kimi-k3',
  instructions:
    'You are an inventory planning assistant. Use code mode to coordinate the available tools when answering inventory questions. Call independent tools in parallel when possible, and explain the result clearly. Use prior messages to answer follow-up questions.',
  tools: { codeMode },
});

export type CodeModeMessage = InferAgentUIMessage<typeof codeModeAgent>;
