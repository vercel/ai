# AI SDK - Vercel Sandbox

_This package is **experimental**._

`HarnessV1SandboxProvider` implementation for [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox).

## Setup

```bash
npm i @ai-sdk/sandbox-vercel
```

## Usage

The factory is synchronous. The returned provider is stable; the actual `@vercel/sandbox` `Sandbox` is created on demand inside `provider.createSession()`.

When neither `runtime` nor `image` is provided, the adapter uses the legacy
`node24` runtime on both Vercel Sandbox v2 and v3. Pass `image` explicitly to
opt into a v3 managed image such as `vercel/sandbox/universal`.

```ts
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

const vercelSandbox = createVercelSandbox({
  runtime: 'node24',
  ports: [3000],
});

const networkSandboxSession = await vercelSandbox.createSession();
const sandboxSession = networkSandboxSession.restricted();

await sandboxSession.writeTextFile({ path: 'hello.txt', content: 'hi' });

const { stdout } = await sandboxSession.run({
  command: 'cat hello.txt',
});
console.log(stdout); // "hi"
await networkSandboxSession.stop();
```

## Authentication

Vercel Sandbox accepts `VERCEL_OIDC_TOKEN`, or explicit `token`, `teamId`, and
`projectId` settings. For local OIDC authentication, link the application with
`vercel link`, run `vercel env pull`, and load the generated `.env.local` before
starting it.

Credential resolution failures throw
`HarnessSandboxAuthenticationError` from `@ai-sdk/harness` and preserve the
underlying Vercel SDK error as `cause`.

`networkSandboxSession.restricted()` is typed as `Experimental_SandboxSession`, so it's safe to pass to AI SDK tools that accept `experimental_sandbox`. The network sandbox session itself carries the infra surface (`ports`, `getPortEndpoint`, `setNetworkPolicy`, `setRequestTransformations`, `addRequestTransformations`, `stop`) that only the harness should reach for. `getPortUrl` remains available as a deprecated compatibility wrapper.

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

To wrap an already-created `@vercel/sandbox` `Sandbox` instead — e.g. when you need credentials or options outside the factory's settings, or you want to share one sandbox across multiple harness sessions — pass it via `sandbox`. Install `@vercel/sandbox` directly if your application imports `Sandbox`. The network sandbox session's `stop()` is a no-op in this case; the caller owns the lifecycle.

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
await networkSandboxSession.setNetworkPolicy?.({
  mode: 'custom',
  allowedHosts: ['api.example.com'],
  deniedCIDRs: ['169.254.169.254/32'],
});
```

`HarnessV1NetworkPolicy` is the harness-level abstraction used here. The provider translates it to `@vercel/sandbox`'s native `NetworkPolicy` for enforcement.

### Request transformations and credential brokering

Vercel Sandbox supports outbound request transformations for use cases such as
credential brokering. `setRequestTransformations()` replaces the managed rules,
while `addRequestTransformations()` adds rules without replacing unrelated
rules. Re-adding a managed rule with the same request matcher and transformed
header names refreshes that rule in place, which keeps resumed credential
brokering idempotent. Network access policies remain authoritative over which
hosts can be reached.
