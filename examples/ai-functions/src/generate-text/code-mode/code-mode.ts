import { experimental_codeModeTool as codeModeTool } from '@ai-sdk/code-mode';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

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

const tools = {
  code_mode: codeModeTool({
    executionPolicy: {
      timeoutMs: 30_000,
      memoryLimitBytes: 64 * 1024 * 1024,
    },
  }),
  getInventory,
  getDemand,
} as const;

run(async () => {
  const result = await generateText({
    model: 'moonshotai/kimi-k3',
    tools,
    experimental_toolCallers: {
      getInventory: ['code_mode'],
      getDemand: ['code_mode'],
    },
    stopWhen: isStepCount(20),
    prompt: 'compare inventory and demand for product sku_123.',
    include: {
      responseBody: true,
    },
  });

  for (const step of result.steps) {
    for (const part of step.content) {
      if (part.type === 'tool-error') {
        console.error('Code mode error:', part.error);
      }
    }
  }

  console.log(JSON.stringify(result.content, null, 2));
  return result;
});
