# AI SDK Code Mode

`@ai-sdk/code-mode` provides an AI SDK tool that runs JavaScript or
type-stripped TypeScript in an isolated QuickJS WASM sandbox. Generated code can
call explicitly provided AI SDK tools and combine their results into one
JSON-serializable value.

## Installation

```bash
pnpm add ai @ai-sdk/code-mode
```

The runtime uses Node.js worker threads and is intended for server-side AI SDK
tools, not browser execution.

## Quick Start

```ts
import { experimental_createCodeModeTool as createCodeModeTool } from '@ai-sdk/code-mode';
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

const codeMode = createCodeModeTool({
  getInventory,
  getDemand,
});

const result = await generateText({
  model,
  tools: { codeMode },
  stopWhen: isStepCount(10),
  prompt: 'Compare inventory and demand for product sku_123.',
});
```

The generated `codeMode` tool accepts one input:

```ts
{
  js: string;
}
```

The model-facing description includes TypeScript signatures for the provided
tools. A generated program can call them sequentially or concurrently:

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

Use `experimental_runCodeMode` to execute source without wrapping it as an AI
SDK tool:

```ts
import { experimental_runCodeMode as runCodeMode } from '@ai-sdk/code-mode';

const result = await runCodeMode({
  js: 'return await tools.getInventory({ productId: "sku_123" });',
  tools: { getInventory },
});
```

## Runtime

Each invocation:

1. validates and type-strips the source
2. checks out a bounded Node.js worker
3. creates a fresh QuickJS context
4. executes nested `tools.*` calls through a worker-to-host bridge
5. validates tool inputs and returns JSON across the bridge
6. disposes the QuickJS context and returns the worker to the pool

Timeouts or aborts terminate the worker. Every invocation has source, memory,
stack, result, tool payload, bridge count, and bridge concurrency limits.

Configure per-invocation limits with `executionPolicy`:

```ts
const codeMode = createCodeModeTool(tools, {
  executionPolicy: {
    timeoutMs: 30_000,
    memoryLimitBytes: 64 * 1024 * 1024,
    maxConsoleOutputBytes: 64 * 1024,
  },
});
```

Use `experimental_setMaxWorkers` to cap active workers process-wide.

## Tool Semantics

Nested tool calls:

- validate inputs against the tool's `inputSchema`
- receive forwarded AI SDK execution context and abort signals
- receive derived tool-call IDs such as `outer-call:tool-1`
- support async iterable outputs by returning the final emitted value
- sanitize host exceptions before they cross into the sandbox

Tools requiring approval are rejected without executing. Approval integration
is not part of the initial API.

Sandboxed `fetch` is not available. External access must be exposed through an
explicit host tool.

Every tool promise must be awaited or otherwise observed before the program
returns. Detached bridge work fails the invocation and is aborted.

## Isolation

Every invocation gets a fresh global scope. The sandbox disables or omits:

- `eval` and dynamic `Function` construction
- Node globals such as `process`, `require`, and `module`
- module loading
- host filesystem access
- `fetch`, WebCrypto, and performance APIs

Treat the sandbox as defense in depth. Generated source and tool arguments are
untrusted, and every capability exposed through a host tool is available to the
generated program.

## TypeScript

Code mode strips TypeScript syntax before execution. This is type stripping
only; it is not a full TypeScript compiler.

## Errors

The package exports:

```ts
CodeModeError;
CodeModeTimeoutError;
CodeModeAbortedError;
CodeModeConcurrencyError;
CodeModeSourceTooLargeError;
CodeModeBridgeLimitError;
CodeModeDetachedBridgeRequestError;
CodeModeProtocolError;
CodeModeToolError;
```

## Development

From the repository root:

```bash
pnpm --filter @ai-sdk/code-mode build
pnpm --filter @ai-sdk/code-mode type-check
pnpm --filter @ai-sdk/code-mode test
```
