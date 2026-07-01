# AI SDK - Eve Harness

The **Eve harness adapter** connects `HarnessAgent` to a specific remote
[Eve](https://eve.dev/) agent.

This package is experimental. Eve owns the agent definition, built-in tools,
skills, model, and sandbox. The adapter does not start a generic Eve harness;
it connects to the Eve agent URL you provide.

## Installation

```bash
pnpm add @ai-sdk/harness @ai-sdk/harness-eve @ai-sdk/sandbox-just-bash
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createEve } from '@ai-sdk/harness-eve';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';

const agent = new HarnessAgent({
  harness: createEve({
    url: process.env.EVE_AGENT_URL!,
  }),
  sandbox: createJustBashSandbox(),
});

const session = await agent.createSession();

try {
  const result = await agent.generate({
    session,
    prompt: 'Summarize the repository state.',
  });

  console.log(result.text);
} finally {
  await session.destroy();
}
```

`HarnessAgent` requires a sandbox provider, but Eve runs against the sandbox
configured by the remote Eve agent. The AI SDK sandbox is created by the
framework and is not used by this adapter.

## Authentication

By default, remote Eve agent URLs use Eve's public Vercel OIDC auth helper.
That helper reads `VERCEL_OIDC_TOKEN` and refreshes development tokens when
needed:

```ts
const harness = createEve({
  url: process.env.EVE_AGENT_URL!,
});
```

For a public Eve agent that does not require auth, opt out explicitly:

```ts
const harness = createEve({
  url: process.env.EVE_AGENT_URL!,
  auth: 'none',
});
```

You can also pass explicit credentials:

```ts
const harness = createEve({
  url: process.env.EVE_AGENT_URL!,
  auth: {
    type: 'vercel-oidc',
    token: process.env.VERCEL_OIDC_TOKEN,
  },
});
```

If the Vercel OIDC resolver needs an explicit Vercel scope, pass `team` and
`project` instead of a static token:

```ts
const harness = createEve({
  url: process.env.EVE_AGENT_URL!,
  auth: {
    type: 'vercel-oidc',
    team: 'team_...',
    project: 'prj_...',
  },
});
```

When `VERCEL_AUTOMATION_BYPASS_SECRET` is set, the adapter forwards it as the
Vercel deployment protection bypass header.

Supported auth modes:

- `auto`
- `none`
- `{ type: 'vercel-oidc', token?, team?, project?, expirationBufferMs? }`
- `{ type: 'bearer', token }`
- `{ type: 'basic', username, password }`

## Limitations

- No `eve` default export is provided. Use `createEve({ url })`.
- Host-defined AI SDK tools are not supported.
- `activeTools` and `inactiveTools` are not supported.
- Host-provided skills are not supported.
- Custom AI SDK sandbox control is not supported by Eve.
- Manual compaction is not supported.
- Eve `ask_question` requests are not supported.

Eve confirmation approvals are supported through tool approval requests.
