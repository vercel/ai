# AI SDK - Pi Harness

`HarnessV1` adapter backed by [`@earendil-works/pi-coding-agent`](https://www.npmjs.com/package/@earendil-works/pi-coding-agent). Pi runs in the host Node.js process and uses the sandbox as a remote filesystem + shell — no bridge process is installed inside the sandbox.

## Setup

```bash
npm i @ai-sdk/harness-pi @ai-sdk/harness @ai-sdk/sandbox-vercel
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi } from '@ai-sdk/harness-pi';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod/v4';

const agent = new HarnessAgent({
  harness: createPi({ thinkingLevel: 'medium' }),
  id: 'demo',
  skills: [
    {
      name: 'careful-refactors',
      description: 'Make minimal diffs and keep tests green.',
      content: 'Prefer changes that touch the fewest files possible.',
    },
  ],
  tools: {
    deploy: tool({
      description: 'Deploy a service.',
      inputSchema: z.object({ env: z.enum(['staging', 'production']) }),
      execute: async ({ env }) => ({ url: `https://${env}.example.com` }),
    }),
  },
});

const sandboxSession = await createVercelNetworkSandboxSession({
  runtime: 'node24',
});
const session = await agent.createSession({ sandboxSession });
try {
  const result = await agent.generate({
    session,
    prompt: 'Read README.md and summarise the goals.',
  });
  console.log(result.text);
} finally {
  await session.destroy();
  await sandboxSession.destroy();
}
```

Pi has no in-sandbox bridge, so the supplied sandbox session does not need
exposed ports. Vercel and just-bash sessions both work.

## Stateless session configuration

By default, a suspended turn can reuse its live Pi session in the same process.
For stateless or multi-replica applications, set `reattachInProcess: false` so
continuations restore persisted state using the current request's settings.
Application-managed credentials can be supplied through a `PiCredentialStore`;
this replaces Pi's file-backed `auth.json` storage.

```ts
import { createPi, type PiCredentialStore } from '@ai-sdk/harness-pi';

declare const credentials: PiCredentialStore;

const harness = createPi({
  credentials,
  reattachInProcess: false,
});
```

## Inline extensions

Use `extensionFactories` to load trusted inline Pi extensions for each harness session:

```ts
import { createPi } from '@ai-sdk/harness-pi';

const harness = createPi({
  extensionFactories: [
    pi => {
      pi.on('agent_start', () => {
        console.log('Pi agent started');
      });
    },
  ],
});
```

Each factory also receives the harness session it runs in, as a second argument. It carries the restricted `sandboxSession`, the `sessionWorkDir` and an `instructions()` getter for the current turn's instructions. Instructions arrive with each turn, so read them while a turn runs rather than when the factory runs. This extension uses all three to report the sandbox's git status when the agent starts:

```ts
import { createPi } from '@ai-sdk/harness-pi';

const harness = createPi({
  extensionFactories: [
    (pi, session) => {
      pi.on('agent_start', async () => {
        const { stdout } = await session.sandboxSession.run({
          command: `git -C ${session.sessionWorkDir} status --short`,
        });
        console.log(session.instructions(), stdout);
      });
    },
  ],
});
```

Routine resource refreshes between turns do not reinitialize extension factories. If the underlying Pi session is rebuilt, factories initialize for the new Pi runtime. Extension factories execute in the host Node.js process, so only pass factories you trust. This option does not enable filesystem extension discovery: user, project, personal, and settings-based Pi extensions remain disabled. Themes and prompt templates also remain disabled.

## File Tool Path Policy

By default, Pi's native file tools can read and write the session workspace,
while harness-provided skills are read-only. Use `fileToolPathPolicy` to expose
additional sandbox paths:

```ts
const harness = createPi({
  fileToolPathPolicy: {
    readableRoots: ['/mnt/reference'],
    writableRoots: ['/tmp', '/mnt/artifacts'],
    deniedRoots: ['/tmp/private'],
  },
});
```

Every configured root must be an absolute path inside the sandbox. Writable
roots are also readable, and denied roots take precedence over the workspace,
harness-provided skills, and configured readable or writable roots.

This policy applies only to Pi's native file tools (`read`, `write`, `edit`,
`grep`, `find`, and `ls`). It does not restrict commands executed by `bash`,
whose filesystem access is defined by the sandbox. The harness
`permissionMode` can require approval for the tool call, but it does not create
a filesystem boundary.

## MCP servers

Use `mcpServers` to serve MCP servers through Pi's native MCP support. Each entry is Pi's MCP server configuration, either stdio (`command`, `args`, `env`, `cwd`) or streamable HTTP (`url`, `headers`):

```ts
import { createPi } from '@ai-sdk/harness-pi';

const harness = createPi({
  mcpServers: {
    docs: {
      url: 'https://mcp.example.com/docs',
      headers: { Authorization: `Bearer ${process.env.DOCS_MCP_TOKEN}` },
      exposure: 'deferred',
    },
  },
});
```

Tools are named `mcp__<server>__<tool>`, with `-` in either name replaced by `_`. A server's tools are declared to the model by default (`exposure: 'direct'`). With `exposure: 'deferred'`, they stay undeclared until the model finds them with Pi's `tool_search` tool, and the model then calls them by name. `toolExposure` sets the exposure of single tools. Pi's `codemode` exposure is not supported, and an entry that uses it or that Pi rejects fails session start.

The harness has no sign-in flow, so an HTTP server that requires authentication must carry an `Authorization` header or `auth.provider`. The harness reads no `mcp.json` and no sign-in stored by the Pi CLI, and writes nothing under Pi's agent directory. `mcpSettings` is deprecated: Pi's native MCP has no tool prefix or output guard settings.
