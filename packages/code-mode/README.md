# AI SDK Code Mode

`@ai-sdk/code-mode` provides an AI SDK tool that runs JavaScript or
type-stripped TypeScript in an isolated QuickJS WASM sandbox. It is meant for
agents that need to call several tools, combine their results, run independent
tool calls concurrently, or do structured JSON transformations in one step.

## Installation

```bash
pnpm add ai @ai-sdk/code-mode
```

The runtime uses Node.js worker threads and is intended for server-side AI SDK
tools, not browser execution.

## Quick Start

```ts
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { experimental_createCodeModeTool as createCodeModeTool } from '@ai-sdk/code-mode';

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

## Observability

Code mode exposes nested bridge activity without parsing generated code or final
tool results. Lifecycle hooks fire for nested tool calls, nested tool results,
fetch requests, fetch results, interrupts, and the final per-invocation trace:

```ts
const codeMode = createCodeModeTool(tools, {
  lifecycle: {
    onNestedToolCall: event => {
      console.log(event.toolName, event.toolCallId);
    },
    onTrace: trace => {
      console.log(trace.status, trace.bridgeRequests.length);
    },
  },
});
```

Lifecycle hook errors are isolated from sandbox execution. Provide
`lifecycle.onHookError` if hook failures should be recorded.

For OpenTelemetry, pass an OTEL-compatible tracer:

```ts
const codeMode = createCodeModeTool(tools, {
  telemetry: {
    isEnabled: true,
    tracer,
    functionId: 'agent.code_mode',
    metadata: { runtime: 'ash' },
  },
});
```

This emits spans for the outer code-mode invocation and each nested tool/fetch
bridge request. Raw source, inputs, and outputs are not recorded; telemetry
attributes include names, ids, status, replay flags, and byte sizes. Set
`recordInputs: false` or `recordOutputs: false` to omit size attributes for
those directions.

To expose nested bridge activity to the model, enable the AI SDK
`toModelOutput` mapping:

```ts
const codeMode = createCodeModeTool(tools, {
  modelOutput: {
    includeNestedToolSummary: true,
    includeNestedToolOutputs: true,
    includeFetchSummary: true,
  },
});
```

Completed `code_mode` results remain unchanged for host code, but the
model-visible tool output becomes:

```ts
{
  result: { foo, barId: { id: bar.id } },
  nestedTools: [
    {
      kind: "tool",
      toolName: "getBar",
      toolCallId: "call_1:tool-1",
      status: "fulfilled",
      replayed: false,
      output: { type: "json", value: { id: bar.id } },
    },
  ],
}
```

Inputs are not included in this model-visible summary. Nested outputs are only
included when `includeNestedToolOutputs` is enabled. When a nested tool defines
AI SDK `toModelOutput`, code mode uses it; otherwise it applies AI SDK's
default text/json tool-output mapping. Interruption
results are not wrapped, so approval and host-interrupt continuation helpers can
still find the pending continuation.

Model-visible summaries are bound to the specific `code_mode` execution that
created them. If the runtime cannot bind a summary to the current invocation, it
returns the normal output with an empty summary rather than using a stale or
shared trace.

## Host Interrupts

Host tools can pause code mode for external work that is not approval, such as
connection OAuth. Call `requestCodeModeInterrupt` from inside the host tool and
store the returned `CodeModeInterrupt` in your session state.

For example, a connection-backed tool can interrupt with
`{ kind: "connection-auth", ... }`, let the host start and complete the OAuth
flow, then resume the same code-mode invocation with
`continueCodeModeInterrupt`. The replay ledger prevents already-completed tool
and fetch calls from running again before the interrupted tool receives the
OAuth resolution.

```ts
import {
  experimental_continueCodeModeInterrupt as continueCodeModeInterrupt,
  experimental_createCodeModeTool as createCodeModeTool,
  experimental_isCodeModeInterrupt as isCodeModeInterrupt,
  experimental_replaceCodeModeInterruptResult as replaceCodeModeInterruptResult,
  experimental_requestCodeModeInterrupt as requestCodeModeInterrupt,
  experimental_unwrapCodeModeResult as unwrapCodeModeResult,
  type CodeModeToolExecutionOptions,
} from '@ai-sdk/code-mode';

const tools = {
  connectionTool: tool({
    inputSchema: z.object({ connectionId: z.string() }),
    execute: async ({ connectionId }, options) => {
      const { codeModeInterrupt } = options as CodeModeToolExecutionOptions;
      if (codeModeInterrupt === undefined) {
        requestCodeModeInterrupt({
          kind: 'connection-auth',
          connectionId,
          scopes: ['read:items'],
        });
      }

      return fetchWithConnection({
        connectionId,
        token: codeModeInterrupt.resolution.token,
      });
    },
  }),
};

const codeMode = createCodeModeTool(tools);
const result = await codeMode.execute?.(
  {
    js: `
      const response = await tools.connectionTool({ connectionId: "conn_1" });
      return { id: response.id, title: response.title };
    `,
  },
  { toolCallId: 'call_1', messages },
);

const normalized = unwrapCodeModeResult(result);
if (
  normalized.status === 'interrupted' &&
  isCodeModeInterrupt(normalized.interrupt)
) {
  session.state.codeMode = normalized.interrupt;
  // Start and complete OAuth using normalized.interrupt.payload.
}

const finalOutput = await continueCodeModeInterrupt({
  interrupt: storedInterrupt,
  resolution: { token: oauthToken },
  tools,
});

messages = replaceCodeModeInterruptResult(
  messages,
  storedInterrupt,
  finalOutput,
);
```

`CodeModeInterrupt` is a JSON-serializable record describing the paused nested
call (`interruptId`, `toolName`, `toolCallId`, `outerToolCallId`, `input`,
`payload`) plus an opaque, host-signed `continuation` replay capability. Persist
the whole interruption and pass it back to `continueCodeModeInterrupt` to resume.
Generic interruptions do not synthesize AI SDK approval messages;
approval-specific helpers below still do.

When several `Promise.all` siblings interrupt together, the continuation ledger
keeps all of them pending. Resume the returned interrupt one at a time;
continuation returns the next pending interrupt until the program completes,
without repeating siblings that already resolved.

## Approval

Code mode preserves AI SDK approval semantics for nested host tools. If sandbox
code calls a tool with `needsApproval: true`, approval is requested for that
inner tool name and input, not for the outer `code_mode` call.

There are two approval modes.

### Callback Approval

Callback approval is the default mode. It is useful when the host can decide
synchronously or asynchronously during the same code-mode invocation.

Without an approval callback, an approval-required nested tool fails with
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

Provide `approval.onApprovalRequired` to approve or deny before the nested tool
executes:

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

### AI SDK Approval Flow

Use interrupt approval when you want to plug into an existing AI SDK or Ash
human-in-the-loop approval flow.

```ts
const codeMode = createCodeModeTool(tools, {
  approval: {
    mode: 'interrupt',
  },
});
```

In interrupt mode, an approval-required nested tool returns a
`CodeModeApprovalInterrupt` instead of executing. Approval is built on the
generic host-interrupt machinery: a `CodeModeApprovalInterrupt` is a
`CodeModeInterrupt` whose payload `kind` is the reserved
`"ai-sdk-code-mode/tool-approval"`. It exposes the inner tool name/input, an
`interruptId` (used as the AI SDK approval id), and the opaque `continuation`.
Store the interrupt by `interruptId`; the continuation is host state and should
not be reconstructed from model-visible messages.

Approval responses are runtime-validated. `getCodeModeApprovalResponse` ignores
malformed approval response parts, including non-boolean `approved` values, and
`continueCodeModeApproval` rejects malformed responses before replay.

The flow is:

1. The model calls `code_mode`.
2. Sandbox code calls an approval-required nested tool.
3. Code mode returns `CodeModeApprovalInterrupt`.
4. `toCodeModeApprovalMessages(interrupt)` creates AI SDK approval message
   parts for the original nested tool.
5. Your approval UI records a `tool-approval-response`.
6. `getCodeModeApprovalResponse(messages, interrupt)` reads that response.
7. `continueCodeModeApproval(...)` restarts the same code with the stored
   continuation.

```ts
import type { ModelMessage } from 'ai';
import {
  experimental_continueCodeModeApproval as continueCodeModeApproval,
  experimental_createCodeModeTool as createCodeModeTool,
  experimental_getCodeModeApprovalResponse as getCodeModeApprovalResponse,
  experimental_isCodeModeApprovalInterrupt as isCodeModeApprovalInterrupt,
  experimental_toCodeModeApprovalMessages as toCodeModeApprovalMessages,
  type CodeModeApprovalInterrupt,
} from '@ai-sdk/code-mode';

const codeMode = createCodeModeTool(tools, {
  approval: {
    mode: 'interrupt',
  },
});

const pendingApprovals = new Map<string, CodeModeApprovalInterrupt>();
const messages: ModelMessage[] = [];
const result = await codeMode.execute?.(
  {
    js: `
      const file = await tools.readFile({ path: "notes.md" });
      await tools.deleteFile({ path: "notes.md" });
      return { deleted: true, file };
    `,
  },
  {
    toolCallId: 'call_1',
    messages,
  },
);

if (isCodeModeApprovalInterrupt(result)) {
  pendingApprovals.set(result.interruptId, result);
  messages.push(...toCodeModeApprovalMessages(result));
  // Render the approval request with your AI SDK/Ash approval UI.
}

// Later, after the UI appends a tool-approval-response message. The AI SDK
// approval id is the interrupt id of the stored approval interrupt:
async function continueAfterApproval(approvalId: string) {
  const interrupt = pendingApprovals.get(approvalId);
  if (interrupt === undefined) {
    throw new Error(`Unknown approval: ${approvalId}`);
  }

  const approvalResponse = getCodeModeApprovalResponse(messages, interrupt);
  if (approvalResponse === undefined) {
    throw new Error(`Approval response is still pending: ${approvalId}`);
  }

  const output = await continueCodeModeApproval({
    interrupt,
    approvalResponse,
    tools,
  });
  pendingApprovals.delete(interrupt.interruptId);
  return output;
}
```

`toCodeModeApprovalMessages` exposes the approval as the original inner tool
name and input. The user approves `deleteFile`, not `code_mode`.

### Continuation Replay

Approval and generic interruption continuation use restart-and-replay. Code mode
restarts the same program and replays the recorded bridge ledger so
already-completed tool and fetch calls are not repeated. If replayed code does
not issue the same bridge calls in the same order, continuation fails with
`CodeModeProtocolError` instead of guessing.

Continuations also replay deterministic guest state for no-argument `Date`,
`Date.now()`, and `Math.random()`. After each completed async host bridge call,
the guest clock is reset to the recorded host timestamp for that call. WebCrypto
and `performance` are not exposed in the sandbox.

Continuation and interruption objects are signed bearer capabilities. A
sandboxed program can return JSON shaped like a code-mode interrupt, but helper
APIs only treat host-signed continuations as resumable. Continuations expire
after one hour by default.

The default signing key is random and process-local. Hosts that run durable or
concurrent sessions should pass a stable secret with each invocation and use
the same policy when inspecting or resuming its continuations:

```ts
const continuationSecurity = {
  signingKey: session.continuationKey,
  maxAgeMs: 7 * 24 * 60 * 60 * 1000,
};

const output = await runCodeMode({
  js,
  tools,
  options: { continuationSecurity },
});

if (isCodeModeInterrupt(output, continuationSecurity)) {
  await continueCodeModeInterrupt({
    interrupt: output,
    resolution,
    tools,
    options: { continuationSecurity },
  });
}
```

Hosts that use one secret for every invocation can instead configure the
process-global default before creating or resuming continuations:

```ts
import { experimental_setCodeModeContinuationSigningKey as setCodeModeContinuationSigningKey } from '@ai-sdk/code-mode';

setCodeModeContinuationSigningKey(process.env.CODE_MODE_CONTINUATION_KEY);
```

The secret is used to authenticate the source, replay ledger, deterministic
state, interrupt ids, tool names, and tool inputs recorded in the continuation.
Mutating any signed field causes replay to fail with `CodeModeProtocolError`.

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

Errors thrown by host tools or host `fetch` implementations are sanitized before
they cross into sandboxed code. Sandboxed code can read a safe `name`, `message`,
and `code`, but not host stack traces or diagnostic `details`. Full diagnostics
remain available to host lifecycle hooks, traces, and telemetry.

## Development

From the repository root:

```bash
pnpm install
pnpm --filter @ai-sdk/code-mode build
pnpm --filter @ai-sdk/code-mode type-check
pnpm --filter @ai-sdk/code-mode test
pnpm check
pnpm publint --filter @ai-sdk/code-mode
```

The test suite covers core execution, generated prompts, tool bridging,
approvals, fetch, exceptions, sandbox hardening, worker concurrency, and
concurrent tool calls within one worker.

End-to-end tests use the Vercel AI Gateway with
`anthropic/claude-haiku-4.5` and are not part of `pnpm test` or
the regular repository test suite. They write the model-generated code-mode programs to
`code-samples/*.ts`. Set `AI_GATEWAY_API_KEY`, then run:

```bash
pnpm --filter @ai-sdk/code-mode test:e2e
```

## License

Apache-2.0. The package license retains the original
`experimental-ai-sdk-code-mode` MIT attribution.
