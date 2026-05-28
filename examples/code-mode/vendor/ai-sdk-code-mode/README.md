# AI SDK Code Mode

`ai-sdk-code-mode` provides an AI SDK tool that runs JavaScript or
type-stripped TypeScript in an isolated QuickJS WASM sandbox. It is meant for
agents that need to call several tools, combine their results, run independent
tool calls concurrently, or do structured JSON transformations in one step.

## Installation

```bash
pnpm add ai-sdk-code-mode
```

The runtime uses Node.js worker threads and is intended for server-side AI SDK
tools, not browser execution.

## Quick Start

```ts
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { createCodeModeTool } from 'ai-sdk-code-mode';

const search = tool({
  description: 'Search indexed documents.',
  inputSchema: z.object({
    query: z.string(),
    limit: z.number().int().optional(),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
      }),
    ),
  }),
  execute: async ({ query, limit }) => {
    return { results: await searchDocuments(query, limit) };
  },
});

const readDocument = tool({
  description: 'Read a document by id.',
  inputSchema: z.object({
    id: z.string(),
  }),
  outputSchema: z.object({
    id: z.string(),
    title: z.string(),
    body: z.string(),
  }),
  execute: async ({ id }) => {
    return await readDocumentById(id);
  },
});

const codeMode = createCodeModeTool(
  {
    search,
    readDocument,
  },
  {
    executionPolicy: {
      timeoutMs: 30_000,
      memoryLimitBytes: 64 * 1024 * 1024,
    },
  },
);

const result = await generateText({
  model,
  tools: { codeMode },
  prompt: 'Search for the latest internal QuickJS notes and summarize them.',
});
```

## What The Model Sees

`createCodeModeTool(tools)` generates the code-mode tool description from the
provided AI SDK tools. The description includes:

- sandbox rules
- whether `fetch` is available, plus the configured fetch policy when present
- TypeScript call signatures for every provided tool, including return types
  when the tool provides an AI SDK `outputSchema`
- examples for calling tools and returning the final value

For example, if you pass `search` and `readDocument`, the model sees guidance
like this in the code-mode tool description:

```ts
declare const tools: {
  /** Search indexed documents. */
  search: (input: { query: string; limit?: number }) => Promise<{
    results: Array<{
      id: string;
      title: string;
    }>;
  }>;
  /** Read a document by id. */
  readDocument: (input: { id: string }) => Promise<{
    id: string;
    title: string;
    body: string;
  }>;
};
```

Inside code mode, calls look like normal async JavaScript:

```ts
const { results } = await tools.search({ query: 'QuickJS', limit: 5 });
const documents = await Promise.all(
  results.map(item => tools.readDocument({ id: item.id })),
);

return {
  count: documents.length,
  titles: documents.map(doc => doc.title),
};
```

`JSON.parse` and `JSON.stringify` are available in the sandbox. Returned values
and tool inputs/outputs must be JSON-serializable.

## API

```ts
createCodeModeTool(tools, options?)
```

Returns an AI SDK `tool()` whose input schema is:

```ts
{
  js: string;
}
```

The `js` string is wrapped in an async function, so top-level `await` and
`return` are supported:

```ts
const first = await tools.search({ query: 'sandbox' });
return { first };
```

The package also exports the lower-level runner:

```ts
import { runCodeMode } from 'ai-sdk-code-mode';

const output = await runCodeMode({
  js: 'return await tools.add({ a: 1, b: 2 });',
  tools: {
    add: tool({
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      execute: async ({ a, b }) => ({ sum: a + b }),
    }),
  },
});
```

## Options

```ts
interface CodeModeOptions {
  executionPolicy?: {
    timeoutMs?: number;
    memoryLimitBytes?: number;
    maxStackSizeBytes?: number;
    maxResultBytes?: number;
    maxSourceBytes?: number;
    maxToolInputBytes?: number;
    maxToolOutputBytes?: number;
    maxBridgeRequests?: number;
    maxInFlightBridgeRequests?: number;
  };
  fetchPolicy?:
    | false
    | {
        fetch?: typeof globalThis.fetch;
        allowedOrigins?: string[];
        allowedUrlPrefixes?: string[];
        allowedMethods?: string[];
        maxResponseBytes?: number;
        allowRedirects?: boolean;
        maxRedirects?: number;
      };
  approval?: {
    onApprovalRequired?: (request: {
      toolName: string;
      input: unknown;
      toolCallId: string;
    }) =>
      | 'approved'
      | 'denied'
      | { approved: boolean; reason?: string }
      | Promise<'approved' | 'denied' | { approved: boolean; reason?: string }>;
  };
}
```

Defaults:

| Option                                      | Default            |
| ------------------------------------------- | ------------------ |
| `executionPolicy.timeoutMs`                 | `30_000`           |
| `executionPolicy.memoryLimitBytes`          | `64 * 1024 * 1024` |
| `executionPolicy.maxStackSizeBytes`         | `2 * 1024 * 1024`  |
| `executionPolicy.maxResultBytes`            | `1024 * 1024`      |
| `executionPolicy.maxSourceBytes`            | `256 * 1024`       |
| `executionPolicy.maxToolInputBytes`         | `1024 * 1024`      |
| `executionPolicy.maxToolOutputBytes`        | `4 * 1024 * 1024`  |
| `executionPolicy.maxBridgeRequests`         | `256`              |
| `executionPolicy.maxInFlightBridgeRequests` | `32`               |
| `fetchPolicy`                               | disabled           |
| `fetchPolicy.maxResponseBytes`              | `1024 * 1024`      |
| `fetchPolicy.allowRedirects`                | `false`            |
| `fetchPolicy.maxRedirects`                  | `10`               |

Worker-pool size is process-global. By default, code mode uses a dynamic
memory-based limit capped at 32 workers. The default admits at least one active
invocation, then only admits another worker when available memory can cover the
configured QuickJS memory limit plus runtime overhead. Override it explicitly
with:

```ts
import { setMaxWorkers } from 'ai-sdk-code-mode';

setMaxWorkers(8);
setMaxWorkers(undefined); // reset to the dynamic memory-based default
```

## Concurrency

Code mode uses a bounded worker pool. Each active invocation checks out one
worker and creates a fresh QuickJS module, runtime, and context for that run.
When the run completes normally, the worker returns to the idle pool. When a run
times out, aborts, or the worker fails, that worker is retired and replaced on a
future invocation.

The worker boundary is intentional. QuickJS can suspend while host tools
execute, so each active invocation still needs an independent asyncified
QuickJS/WASM instance. Workers also give the host a hard termination boundary
for runaway code; instantiating multiple WASM modules in the main thread would
preserve asyncify independence, but it would not provide the same event-loop
isolation or reliable timeout kill path.

Tool calls inside one sandbox can also run concurrently:

```ts
const [profile, invoices, tickets] = await Promise.all([
  tools.getProfile({ userId }),
  tools.listInvoices({ userId }),
  tools.listTickets({ userId }),
]);

return { profile, invoices, tickets };
```

Use `setMaxWorkers` to cap the number of active pooled workers. When the limit
is reached, new invocations fail with `CodeModeConcurrencyError`. The slot stays
occupied until the sandbox result and any accepted host bridge work have settled
or observed abort, so detached host work cannot silently outlive accounting.

Every tool or fetch promise created inside code mode must be awaited or otherwise
handled before returning. An unawaited bridge call fails with
`CodeModeDetachedBridgeRequestError`; an observed bridge call that is still
pending when the script returns is aborted and also fails the invocation.
`maxBridgeRequests` limits total bridge calls per invocation, and
`maxInFlightBridgeRequests` limits concurrent tool/fetch calls inside one
sandbox.

## Tool Semantics

Nested tool calls preserve the important AI SDK behavior:

- tool inputs are validated against each tool's `inputSchema`
- `execute` receives forwarded `ToolExecutionOptions`, including abort signals
- nested calls get derived `toolCallId` values for tracing
- thrown tool errors are propagated
- async iterable tool outputs are consumed and the final output is returned
- tools without `execute` are rejected
- unknown tools fail clearly

Only top-level tool names are intended for the public API:

```ts
await tools.search({ query: '...' });
```

## Approvals

If a nested tool has `needsApproval: true` or returns `true` from
`needsApproval(input, options)`, code mode does not execute it silently.

Without an approval callback, the invocation fails with
`CodeModeToolApprovalRequiredError`:

```ts
const codeMode = createCodeModeTool({
  deleteFile: tool({
    inputSchema: z.object({ path: z.string() }),
    needsApproval: true,
    execute: async ({ path }) => deleteFile(path),
  }),
});
```

To handle approvals inside code mode, provide `approval.onApprovalRequired`:

```ts
const codeMode = createCodeModeTool(tools, {
  approval: {
    onApprovalRequired: async ({ toolName, input, toolCallId }) => {
      const approved = await askUserForApproval({
        toolName,
        input,
        toolCallId,
      });
      return approved ? 'approved' : { approved: false, reason: 'User denied' };
    },
  },
});
```

If the callback denies approval, the invocation fails with
`CodeModeToolApprovalDeniedError`.

## Fetch

`fetch` is not available by default. Enable it by passing a host fetch function
and an allow policy:

```ts
const codeMode = createCodeModeTool(tools, {
  fetchPolicy: {
    fetch: globalThis.fetch,
    allowedOrigins: ['https://api.example.com'],
    allowedMethods: ['GET', 'POST'],
    maxResponseBytes: 256 * 1024,
  },
});
```

Fetch policy rules:

- URLs must be `http:` or `https:`
- the original URL and final response URL must match `allowedOrigins` or
  `allowedUrlPrefixes`
- `allowedUrlPrefixes` entries are origin plus path prefixes only; query strings
  and fragments in configured prefixes are rejected
- allowed methods default to `GET` and `HEAD`
- redirects are not followed unless `allowRedirects` is `true`; when enabled,
  code mode follows each redirect with another host fetch that is subject to the
  same fetch policy
- response bodies are size-limited while streaming where the host `Response`
  exposes a readable body, and always before they enter the sandbox

The sandbox fetch response supports `ok`, `status`, `statusText`, `url`,
`headers.get()`, `headers.entries()`, `text()`, `json()`, and `arrayBuffer()`.

## Isolation And Security

Every invocation gets a fresh global scope. The sandbox disables or omits common
host escape hatches:

- `eval`
- `Function`
- Node globals such as `process`, `require`, and `module`
- module loading
- host filesystem access

The runtime also applies source-size, memory, stack, timeout, result-size,
tool-input-size, tool-output-size, bridge-count, bridge-concurrency, and
fetch-response-size limits.

Treat the sandbox as defense in depth. Any capability you expose through tools
or `fetch` is available to generated code, so keep tools narrow and validate
their inputs.

## TypeScript

Code mode strips TypeScript syntax before execution. This is type stripping
only; it is not a full TypeScript compiler. TypeScript types are accepted for
model ergonomics, but the sandbox executes JavaScript.

## Errors

The package exports these error classes:

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
CodeModeToolApprovalRequiredError;
CodeModeToolApprovalDeniedError;
CodeModeFetchError;
```

All code-mode-specific errors include a `code` string and may include `details`
for debugging.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm validate
```

The test suite covers core execution, generated prompts, tool bridging,
approvals, fetch, exceptions, sandbox hardening, worker concurrency, and
concurrent tool calls within one worker.

## Benchmark

```bash
pnpm bench
```

The benchmark in `benchmark/three-roundtrips.mjs` measures a minimal script that
does three sequential sandbox-to-host tool round trips and no meaningful
compute. Use `BENCH_WARMUP` and `BENCH_ITERATIONS` to adjust run length:

```bash
BENCH_WARMUP=50 BENCH_ITERATIONS=1000 pnpm bench
```
