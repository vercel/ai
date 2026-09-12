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

The adapter supports typed prompt, host-defined tools, manual compaction,
stop/resume, and destroy lifecycle operations. Host tools execute outside Jcode
through Harness V1's `submitToolResult` flow and require Jcode runtime and SDK
1.3.0 or newer. Turn suspension, lossless turn continuation, live detach, JSON
response formats, and mid-turn user messages are not supported yet and reject
with `HarnessCapabilityUnsupportedError`.

For release validation, run `scripts/release-validation.sh`. It builds release
binaries, packs the local SDK and runtime, installs all artifacts into a clean
consumer, launches the bundled runtime, and verifies `external_tools_v1`. Setting
`RUN_VERCEL_SANDBOX=1` additionally requires `VERCEL_OIDC_TOKEN` and a bridge
lockfile regenerated against the published SDK version. This prevents a sandbox
release from silently installing an older SDK.

Host execution remains an explicit fallback for trusted local workspaces only:

```ts
const hostHarness = createJcode({
  experimentalHostExecution: true,
  jcodeHome: '/durable/jcode-home',
});
```

Host execution bypasses the supplied sandbox boundary. Do not enable it for
remote or untrusted workspaces.
