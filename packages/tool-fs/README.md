# AI SDK Filesystem Tools

First-party, provider-independent filesystem tools for the [AI SDK](https://ai-sdk.dev/docs).

`@ai-sdk/tool-fs` provides `read`, `write`, `edit`, `deleteFile`, `list`,
`glob`, and `grep` tools for any model that supports function calling. The
tools operate on the `Experimental_SandboxSession` passed as
`experimental_sandbox` to `generateText`, `streamText`, or an agent. Use
`@ai-sdk/sandbox-just-bash` for an in-memory environment,
`@ai-sdk/sandbox-vercel` for Vercel Sandbox, or your own implementation.

## Installation

```sh
pnpm add ai @ai-sdk/tool-fs @ai-sdk/sandbox-just-bash
```

Requires Node.js 22.13 or newer.

## Usage

```ts
import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { experimental_createFsTools as createFsTools } from '@ai-sdk/tool-fs';
import { generateText, isStepCount } from 'ai';

const session = await createJustBashNetworkSandboxSession();

try {
  const sandbox = session.restricted();
  await sandbox.writeTextFile({
    path: 'src/math.ts',
    content: 'export const add = (a: number, b: number) => a - b;\n',
  });

  const result = await generateText({
    model, // Your configured model with function calling support.
    tools: createFsTools(),
    experimental_sandbox: sandbox,
    stopWhen: isStepCount(20),
    prompt: 'Fix the bug in src/math.ts.',
  });

  console.log(result.text);
} finally {
  await session.destroy();
}
```

The tools do not hold a sandbox, so you can create them once and use them with
a different sandbox for each request. Pick a subset by destructuring, for
example `const { read, list, glob, grep } = createFsTools()`.

See the [Filesystem Tools documentation](https://ai-sdk.dev/docs/ai-sdk-core/tools#filesystem-tools)
for the tools, options, and how searches work in different sandboxes.
