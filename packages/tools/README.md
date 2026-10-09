# AI SDK Tools

First-party, provider-independent tools for the [AI SDK](https://ai-sdk.dev/docs).

## Bash

```sh
pnpm add ai @ai-sdk/tools
```

```ts
import { createBashTool } from '@ai-sdk/tools/bash';
import { generateText, isStepCount } from 'ai';

const { bash, sandbox } = await createBashTool({
  files: { 'notes.txt': 'Apples: 10\nPears: 20\n' },
});

const result = await generateText({
  model, // Your configured model with function calling support.
  tools: { bash },
  stopWhen: isStepCount(5),
  prompt: 'Read notes.txt and write a summary to summary.txt.',
});

console.log(result.text);
console.log(await sandbox.readFile('/workspace/summary.txt'));
```

The AI SDK implements the tool's schema, instructions, execution, and output
handling, using [`just-bash`](https://github.com/vercel-labs/just-bash) as the
execution engine. Commands run in the application's Node.js process against an
in-memory filesystem.
No host shell or remote service is started. Requires Node.js 22.13 or newer.

Initial file paths are relative to `/workspace`. Reuse the returned tool across
turns to retain file changes. Each factory call creates an independent workspace;
files are not persisted across process restarts. Shell variables and working
directory changes reset between commands.

Pass a positive integer `maxOutputLength` to control the number of characters
retained from each of stdout and stderr (default: 30,000), before a truncation
notice is appended. This
limits returned output, not execution memory or duration.

This initial API exposes only the bash tool and the application-side workspace
handle. It does not expose separate read/write tools, host directory access,
custom executors, or arbitrary installed programs such as `pnpm`.

See the [Bash Tool documentation](https://ai-sdk.dev/docs/ai-sdk-core/bash-tool).
