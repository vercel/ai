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
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod/v4';

const agent = new HarnessAgent({
  harness: createPi({ thinkingLevel: 'medium' }),
  id: 'demo',
  sandbox: createVercelSandbox({ runtime: 'node24' }),
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

const session = await agent.createSession();
try {
  const result = await agent.generate({
    session,
    prompt: 'Read README.md and summarise the goals.',
  });
  console.log(result.text);
} finally {
  await session.destroy();
}
```

The adapter requires a `HarnessV1SandboxProvider`. Pi has no in-sandbox bridge, so the sandbox doesn't need to expose any ports — `@ai-sdk/sandbox-vercel` or `@ai-sdk/sandbox-just-bash` both work.

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
`grep`, `glob`, and `ls`). It does not restrict commands executed by `bash`,
whose filesystem access is defined by the sandbox. The harness
`permissionMode` can require approval for the tool call, but it does not create
a filesystem boundary.
