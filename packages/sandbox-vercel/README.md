# AI SDK - Vercel Sandbox

`HarnessV1SandboxProvider` implementation backed by [`@vercel/sandbox`](https://vercel.com/docs/vercel-sandbox). Construct the provider at module scope and pass it to a `HarnessAgent` — the agent calls `provider.create()` lazily on the first turn and stops the sandbox when the agent closes.

## Setup

```bash
npm i @ai-sdk/sandbox-vercel @vercel/sandbox
```

## Usage

The factory is synchronous. The returned provider is stable; the actual `@vercel/sandbox` `Sandbox` is created on demand inside `provider.create()`.

```ts
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

const sandbox = createVercelSandbox({
  runtime: 'node24',
  ports: [3000],
});

const sandboxSession = await sandbox.create();
const session = sandboxSession.restricted();

await session.writeTextFile({ path: 'hello.txt', content: 'hi' });
const { stdout } = await session.run({
  command: 'cat hello.txt',
});
await sandboxSession.stop();
```

`sandboxSession.restricted()` is typed as `Experimental_SandboxSession`, so it's safe to pass to AI SDK tools that accept `experimental_sandbox`. The network sandbox session itself carries the infra surface (`ports`, `getPortUrl`, `setNetworkPolicy`, `stop`) that only the harness should reach for.

The flat-field settings are aliased directly from `@vercel/sandbox`'s `Sandbox.create` parameters, so every option Vercel supports — including its native `NetworkPolicy` — is available without re-declaration:

```ts
const sandbox = createVercelSandbox({
  runtime: 'node24',
  ports: [3000],
  timeout: 10 * 60 * 1000,
  networkPolicy: {
    allow: ['api.example.com'],
    subnets: { deny: ['169.254.169.254/32'] },
  },
});
```

To wrap an already-created `@vercel/sandbox` `Sandbox` instead — e.g. when you need credentials or options outside the factory's settings, or you want to share one sandbox across multiple harness sessions — pass it via `sandbox`. The network sandbox session's `stop()` is a no-op in this case; the caller owns the lifecycle.

```ts
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { Sandbox } from '@vercel/sandbox';

const sandbox = createVercelSandbox({
  sandbox: await Sandbox.create({ runtime: 'node24', ports: [3000] }),
});
```

### Mid-session network policy

Once the network sandbox session is alive, the host can update outbound network policy on the running sandbox:

```ts
await sandboxSession.setNetworkPolicy?.({
  mode: 'custom',
  allowedHosts: ['api.example.com'],
  deniedCIDRs: ['169.254.169.254/32'],
});
```

`HarnessV1NetworkPolicy` is the harness-level abstraction used here. The provider translates it to `@vercel/sandbox`'s native `NetworkPolicy` for enforcement.
