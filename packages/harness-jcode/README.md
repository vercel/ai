# `@ai-sdk/harness-jcode`

Experimental Harness V1 adapter for [Jcode](https://github.com/1jehuang/jcode).

```ts
import { createJcode } from '@ai-sdk/harness-jcode';

const harness = createJcode({
  model: 'openai-oauth:gpt-5.6-sol',
  reasoningEffort: 'high',
  env: {
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY!,
  },
});
```

By default, Jcode runs inside the supplied network sandbox. Install the recipe
returned by `harness.getBootstrap()` in the sandbox before starting a session,
and expose at least one TCP port. The adapter starts `dist`'s bootstrap bridge
with a per-session work directory, bridge state directory, Jcode home, random
authentication token, and exposed port. `env` is forwarded to that sandbox
process for API-key or gateway authentication.

For basic sandbox sessions without port discovery, configure both `port` and
`portEndpoint`. `jcodeHome` can override the default durable per-session Jcode
home.

The adapter supports typed prompt, manual compaction, stop/resume, and destroy
lifecycle operations. Host-defined tools, turn suspension, lossless turn
continuation, live detach, JSON response formats, and mid-turn user messages are
not supported yet and reject with `HarnessCapabilityUnsupportedError`.

Host execution remains an explicit fallback for trusted local workspaces only:

```ts
const hostHarness = createJcode({
  experimentalHostExecution: true,
  jcodeHome: '/durable/jcode-home',
});
```

Host execution bypasses the supplied sandbox boundary. Do not enable it for
remote or untrusted workspaces.
