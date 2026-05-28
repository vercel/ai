# AI SDK Code Mode Comparison

This example compares two implementations of the same support-case workflow:

- direct AI SDK tools exposed to the model
- a single `codeMode` tool from `ai-sdk-code-mode` that orchestrates the same
  host tools inside a QuickJS sandbox

The Next.js server runs both implementations, records model steps, host-tool
calls, timing, token usage, and renders a final word diff between the answers.

## Run

```bash
pnpm install
cd examples/code-mode
pnpm dev
```

Set `AI_GATEWAY_API_KEY` or the provider credentials required by the selected
AI Gateway model before running the benchmark. The default model is
`openai/gpt-5.4-nano`, and can be changed in the UI.

`ai-sdk-code-mode` is currently linked from `vendor/ai-sdk-code-mode`, a source
snapshot of `vercel-labs/ai-sdk-code-mode`. The example builds that linked
package into its local `dist` directory before `dev`, `build`, or `type-check`
so its worker-thread runtime can load `worker.js` normally.
