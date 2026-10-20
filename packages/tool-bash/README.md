# AI SDK Bash Tool

A first-party, provider-independent bash tool for the [AI SDK](https://ai-sdk.dev/docs).

The `@ai-sdk/tool-bash` entry point provides a bash tool for any model supporting
function calling. Supply an `Experimental_SandboxSession` to choose where commands
run. Use `@ai-sdk/sandbox-just-bash` for an in-memory environment,
`@ai-sdk/sandbox-vercel` for Vercel Sandbox, or your own implementation.

The tool has no direct dependency on either runtime.

## Installation

Install the tool and the sandbox adapter you want to use:

```sh
pnpm add ai @ai-sdk/tool-bash @ai-sdk/sandbox-just-bash
```

Requires Node.js 22.13 or newer.

## Usage

```ts
import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';
import { experimental_createBashTool as createBashTool } from '@ai-sdk/tool-bash';
import { generateText, isStepCount } from 'ai';

const session = await createJustBashNetworkSandboxSession();

try {
  const sandbox = session.restricted();
  await sandbox.writeTextFile({
    path: 'notes.txt',
    content: 'Apples: 10\nPears: 20\n',
  });
  const bash = await createBashTool({ sandbox });

  const result = await generateText({
    model, // Your configured model with function calling support.
    tools: { bash },
    stopWhen: isStepCount(5),
    prompt: 'Read notes.txt and write a summary to summary.txt.',
  });

  console.log(result.text);
  console.log(await sandbox.readTextFile({ path: 'summary.txt' }));
} finally {
  await session.destroy();
}
```

`experimental_createBashTool()` returns the tool directly. Read generated files through the
supplied sandbox using `readTextFile({ path })`, which returns `null` if missing.
The just-bash adapter resolves relative read paths against its default directory.
When overriding `workingDirectory`, use absolute paths to read files there.

The caller owns the sandbox lifecycle. Tools sharing a session share files.
Seed files through `sandbox.writeTextFile({ path, content })` before running the
tool. Commands use the sandbox's default working directory. Set
`workingDirectory` to an absolute path to override it; explicit directories are
created if needed. Without an override, creating the tool runs no setup commands.
Commands, networking, and persistence depend on the sandbox.

## Vercel Sandbox

Install `@ai-sdk/sandbox-vercel` and `@vercel/sandbox` to use an existing native
Vercel Sandbox. Wrap it with the adapter before passing it to the tool:

```ts
import { createVercelSandboxSessionFromNativeSandbox } from '@ai-sdk/sandbox-vercel';
import { experimental_createBashTool as createBashTool } from '@ai-sdk/tool-bash';
import { Sandbox } from '@vercel/sandbox';

const nativeSandbox = await Sandbox.create();

try {
  const sandbox = createVercelSandboxSessionFromNativeSandbox(nativeSandbox);
  await sandbox.writeTextFile({
    path: 'notes.txt',
    content: 'Hello from Vercel Sandbox',
  });
  const bash = await createBashTool({ sandbox });

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

See the [Bash Tool documentation](https://ai-sdk.dev/docs/ai-sdk-core/tools#bash-tool)
for options and file handling.
