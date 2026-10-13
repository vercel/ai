# AI SDK Tools

First-party, provider-independent tools for the [AI SDK](https://ai-sdk.dev/docs).

## Bash

The `@ai-sdk/tools/bash` entry point provides a bash tool for any model supporting
function calling. Supply an `Experimental_SandboxSession` to choose where commands
run. Use `@ai-sdk/sandbox-just-bash` for an in-memory environment,
`@ai-sdk/sandbox-vercel` for Vercel Sandbox, or your own implementation.

The tool has no direct dependency on either runtime.

## Installation

Install the tool and the sandbox adapter you want to use:

```sh
pnpm add ai @ai-sdk/tools @ai-sdk/sandbox-just-bash
```

Requires Node.js 22.13 or newer.

## Usage

```ts
import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { bashTool } from '@ai-sdk/tools/bash';
import { generateText, isStepCount } from 'ai';

const session = await createJustBashNetworkSandboxSession();

try {
  const sandbox = session.restricted();
  const bash = await bashTool({
    sandbox,
    files: { 'notes.txt': 'Apples: 10\nPears: 20\n' },
  });

  const result = await generateText({
    model, // Your configured model with function calling support.
    tools: { bash },
    stopWhen: isStepCount(5),
    prompt: 'Read notes.txt and write a summary to summary.txt.',
  });

  console.log(result.text);
  console.log(await sandbox.readTextFile({ path: '/workspace/summary.txt' }));
} finally {
  await session.destroy();
}
```

`bashTool()` returns the tool directly. Read generated files through the
supplied sandbox using `readTextFile({ path })`, which returns `null` if missing.

The caller owns the sandbox lifecycle. Tools sharing a session share files.
Initial files are relative to `workingDirectory` (default: `/workspace`), which
is created if needed. Commands, networking, and persistence depend on the sandbox.

## Vercel Sandbox

Install `@ai-sdk/sandbox-vercel` and `@vercel/sandbox` to use an existing native
Vercel Sandbox. Wrap it with the adapter before passing it to the tool:

```ts
import { createVercelSandboxSessionFromNativeSandbox } from '@ai-sdk/sandbox-vercel';
import { bashTool } from '@ai-sdk/tools/bash';
import { Sandbox } from '@vercel/sandbox';

const nativeSandbox = await Sandbox.create();

try {
  const bash = await bashTool({
    sandbox: createVercelSandboxSessionFromNativeSandbox(nativeSandbox),
    workingDirectory: '/vercel/sandbox/workspace',
    files: { 'notes.txt': 'Hello from Vercel Sandbox' },
  });

  // Use bash with generateText, streamText, or ToolLoopAgent here.
} finally {
  await nativeSandbox.stop();
}
```

You can also create a managed session with
`createVercelNetworkSandboxSession()` from `@ai-sdk/sandbox-vercel` and pass
`session.restricted()`. For an existing native just-bash `Sandbox`, use
`createJustBashSandboxSessionFromNativeSandbox()` from `@ai-sdk/sandbox-just-bash`.
Raw runtime instances need their respective adapters; a custom
`Experimental_SandboxSession` can be passed directly.

Pass `maxOutputLength` to limit characters retained from each output stream
(default: 30,000). Cancellation is forwarded to the supplied session.

See the [Bash Tool documentation](https://ai-sdk.dev/docs/ai-sdk-core/bash-tool)
for options and file handling.
