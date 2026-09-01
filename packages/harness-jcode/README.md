# `@ai-sdk/harness-jcode`

Experimental Harness V1 adapter for [Jcode](https://github.com/1jehuang/jcode).

```ts
import { createJcode } from '@ai-sdk/harness-jcode';

const harness = createJcode({
  // Temporary opt-in until the in-sandbox Jcode bridge is implemented.
  experimentalHostExecution: true,
  model: 'openai-oauth:gpt-5.6-sol',
  reasoningEffort: 'high',
  jcodeHome: '/durable/jcode-home',
});
```

The initial implementation launches Jcode through `@1jehuang/jcode-sdk` and
streams text, reasoning, built-in tool lifecycle, usage, compaction, and raw
events as typed Harness V1 stream parts. Host-defined tools and lossless
cross-process turn continuation require future Jcode protocol additions.

Host execution is deliberately opt-in because it does not enforce the supplied
Harness sandbox boundary. Do not enable it for remote or untrusted workspaces.
The production path is an in-sandbox bootstrap/bridge, which remains the next
host-integration phase. The bridge runtime and deterministic bootstrap recipe
are included in this package; wiring the host `SandboxChannel` startup path is
still in progress.
