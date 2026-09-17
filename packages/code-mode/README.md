# AI SDK Code Mode

`@ai-sdk/code-mode` lets models write JavaScript or TypeScript that calls your
AI SDK tools. The code runs in an isolated QuickJS sandbox and returns a
JSON-serializable value.

Use code mode when a model needs to call several tools, transform their results,
or run them concurrently. Only the tools you provide are available to the
generated code.

## Installation

```bash
pnpm add ai @ai-sdk/code-mode
```

This package runs on the server and requires Node.js 22.13 or newer.

## Usage

```ts
import {
  DIRECT_TOOL_CALL,
  experimental_codeModeTool as codeModeTool,
} from '@ai-sdk/code-mode';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';

const getInventory = tool({
  description: 'Get available inventory for a product.',
  inputSchema: z.object({ productId: z.string() }),
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
  description: 'Get requested units for a product.',
  inputSchema: z.object({ productId: z.string() }),
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
    },
  }),
  getInventory,
  getDemand,
} as const;

const result = await generateText({
  model,
  tools,
  experimental_toolCallers: {
    getInventory: ['code_mode', DIRECT_TOOL_CALL],
    getDemand: ['code_mode'],
  },
  stopWhen: isStepCount(10),
  prompt: 'Compare inventory and demand for product sku_123.',
});
```

The model can then generate code like:

```ts
const [inventory, demand] = await Promise.all([
  tools.getInventory({ productId: 'sku_123' }),
  tools.getDemand({ productId: 'sku_123' }),
]);

return {
  sufficient: inventory.availableUnits >= demand.requestedUnits,
  remaining: inventory.availableUnits - demand.requestedUnits,
};
```

## Direct Execution

Use `experimental_runCodeMode` to run code directly:

```ts
import { experimental_runCodeMode as runCodeMode } from '@ai-sdk/code-mode';

const result = await runCodeMode({
  js: 'return await tools.getInventory({ productId: "sku_123" });',
  tools: { getInventory },
});
```
