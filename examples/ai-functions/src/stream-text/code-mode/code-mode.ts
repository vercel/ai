import {
  DIRECT_TOOL_CALL,
  experimental_codeModeTool as codeModeTool,
} from '@ai-sdk/code-mode';
import { isStepCount, streamText, tool } from 'ai';
import { z } from 'zod';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: 'moonshotai/kimi-k3',
    tools: {
      code_mode: codeModeTool({
        executionPolicy: {
          timeoutMs: 30_000,
          memoryLimitBytes: 64 * 1024 * 1024,
        },
      }),
      getInventory: tool({
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
      }),
      getDemand: tool({
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
      }),
    },
    experimental_toolCallers: {
      getInventory: [DIRECT_TOOL_CALL],
      getDemand: ['code_mode'],
    },
    stopWhen: isStepCount(20),
    prompt: 'compare inventory and demand for product sku_123.',
    include: {
      rawChunks: true,
    },
  });

  await printFullStream({ result });
});
