# AI SDK - Code Mode

`@ai-sdk/code-mode` lets models write JavaScript or TypeScript that calls your
AI SDK tools. The code runs in an isolated QuickJS sandbox and returns a
JSON-serializable value.

## Setup

```bash
npm i ai @ai-sdk/code-mode zod
```

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

See the [Code Mode documentation](https://ai-sdk.dev/docs/ai-sdk-core/code-mode) for more information.
