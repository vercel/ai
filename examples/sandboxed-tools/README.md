# Sandboxed Tools Example

Run tool-calling agents where the LLM-emitted code executes inside a WASM
sandbox instead of the host runtime — using
[`@wasmagent/aisdk`](https://www.npmjs.com/package/@wasmagent/aisdk) and the
AI SDK's `tool()` primitive.

## What this example shows

Two runnable scripts solve the same task (add 3 + 4, multiply by 2, format as
currency) so you can compare the two patterns side-by-side:

| Script | Pattern | Model round-trips | Tool slots in context |
|--------|---------|:-----------------:|:---------------------:|
| `baseline.ts` | Direct tool calls — the model calls `add`, `multiply`, `formatCurrency` one at a time | 3 | 3 |
| `sandboxed.ts` | `codeModeTool` — the model emits one JS snippet; the kernel runs all three calls internally | 1 | 1 |

Both scripts use `MockLanguageModelV2` — **no API key required**. The mock
produces deterministic tool-call sequences so the example is CI-safe and runs
offline.

## When to use this pattern

**Good fit:**
- The agent needs to chain ≥ 3 tool calls per task — collapsing them into one
  code round saves tokens and latency.
- You want execution isolation: the LLM's code runs in a QuickJS WASM sandbox,
  not in your Node/Edge runtime.
- You need governance: `CapabilityManifest` gates network hosts, env vars,
  CPU time, and memory per call without per-tool if-statements.
- You want to swap sandboxes later: swap `QuickJSKernel` for `PyodideKernel`
  (Python), `WasmtimeKernel` (WASI), or `RemoteSandboxKernel` (E2B / CF
  Sandbox) without changing the AI SDK wiring.

**Poor fit:**
- Tool count is small (< 3) and the extra indirection isn't worth it.
- Tools must stream partial results back to the user between individual calls.
- Compliance requires logging every individual tool invocation rather than the
  composite script.

## Running the example

No API key is required:

```sh
# From the repo root
pnpm install
pnpm build

# From this directory
pnpm baseline    # direct tool calls
pnpm sandboxed   # sandboxed via codeModeTool + QuickJSKernel
```

To test with a real LLM, copy `.env.example` to `.env`, add your key, and
replace `MockLanguageModelV2` in the script with your chosen provider model
(e.g. `openai('gpt-4o-mini')` from `@ai-sdk/openai`).

## Capability gating

The `CapabilityManifest` passed to `codeModeTool` controls what the
LLM-emitted code can do inside the sandbox:

```ts
codeModeTool({
  kernel: new QuickJSKernel(),
  tools: registry,
  capabilities: {
    allowedHosts: ['api.example.com'],   // opt-in network access
    cpuMs: 3000,                         // per-call CPU cap
    memoryLimitBytes: 32 * 1024 * 1024, // 32 MB heap cap
    env: { REGION: 'us-east-1' },        // safe env injection
  },
})
```

The same manifest shape works across all agentkit kernels — switch kernels
without changing the security policy.

## MCP as an optional add-on

`@wasmagent/aisdk` is a pure AI SDK integration. If you also want to expose the
sandboxed execution surface over the Model Context Protocol, see
[`@wasmagent/mcp-server`](https://www.npmjs.com/package/@wasmagent/mcp-server)
which wraps the same kernels as an MCP server. Both packages share the same
`CapabilityManifest` type, so a policy written for one works verbatim in the
other.
