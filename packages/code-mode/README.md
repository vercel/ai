# AI SDK Code Mode

`@ai-sdk/code-mode` lets models write JavaScript or TypeScript that calls your
AI SDK tools. The code runs in an isolated QuickJS sandbox and returns its
serialized JavaScript value without flattening rich values to JSON.

Nested tools may pause for approval or authentication. Code mode returns an
opaque replay continuation that can later resume without repeating completed
tool effects.

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
import { experimental_codeModeTool as codeModeTool } from '@ai-sdk/code-mode';
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
  experimental_toolCallers: ({ code_mode }) => ({
    getInventory: [code_mode],
    getDemand: [code_mode],
  }),
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

## Values across the sandbox boundary

Code mode preserves JavaScript data instead of applying `JSON.stringify`
coercions. Final results, tool inputs, and tool outputs can contain
`undefined`, `BigInt`, special numeric values, dates, regular expressions,
maps, sets, binary buffers and typed arrays, cycles, sparse arrays, and repeated
references. For example, a returned `Map` remains a `Map`, and `NaN` does not
silently become `null`.

Tool input schemas still run after deserialization and may intentionally
restrict those values. Functions, symbols, promises, weak collections, and
arbitrary class instances cannot cross the boundary. `Error` values preserve
their name, message, cause, and aggregate errors, but not their original stack.

Errors that escape code execution include a sanitized stack whose `run.js`
line numbers refer directly to the supplied `js` string. Code mode preserves
these source frames while adapting the error to its `CodeModeError` API; frames
from the generated wrapper and sandbox runtime are omitted.

## Approvals and interruptions

Tools with `needsApproval` pause code mode before their `execute` function is
called. Resume by passing the continuation and a resolution back to
`experimental_runCodeMode`:

Set one signing secret on every process that creates or resumes continuations:

```sh
export RUN_CONTINUATION_SECRET="$(openssl rand -base64 32)"
```

Code mode reads this environment variable automatically. Ordinary executions
need no secret, but an interruption fails clearly if signing is not configured.

```ts
import {
  experimental_isCodeModeInterrupted as isCodeModeInterrupted,
  experimental_runCodeMode as runCodeMode,
} from '@ai-sdk/code-mode';

const continuationContext = {
  tenantId: authenticatedTenant.id,
  userId: authenticatedUser.id,
  policyVersion: '2026-08-01',
};
const first = await runCodeMode({ js, tools, continuationContext });

if (isCodeModeInterrupted(first)) {
  const completed = await runCodeMode({
    js,
    tools,
    continuationContext,
    continuation: first.continuation,
    resolutions: first.interruptions.map(({ id }) => ({
      interruptionId: id,
      value: true,
    })),
  });
}
```

Concurrent nested approvals are returned together. A tool can also call
`executionOptions.interrupt(payload)` for an application-defined auth or
approval flow and read `executionOptions.resume` when it is reinvoked. Always
derive `continuationContext` from authenticated server state and independently
authorize the actor submitting a resolution. Code mode binds the continuation
to that context, its audience, source, and tool-name manifest before replay.

Nested `toolCallId` values are unique per logical code-mode run and remain
stable across replay, so they can be used for tracing and idempotency.

For explicit application configuration, pass `continuationSecret` when creating
the tool or in the `options` supplied to direct execution:

```ts
const codeMode = codeModeTool({
  continuationSecret: process.env.RUN_CONTINUATION_SECRET!,
});

await runCodeMode({
  js,
  tools,
  options: {
    continuationSecret: process.env.RUN_CONTINUATION_SECRET!,
  },
});
```

Use `continuationCodec` instead when you need signing-key rotation or
storage-backed, at-most-once continuations. It cannot be combined with
`continuationSecret`.
