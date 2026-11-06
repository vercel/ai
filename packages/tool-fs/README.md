# AI SDK - Filesystem Tools

First-party, provider-independent filesystem tools for the [AI SDK](https://ai-sdk.dev/docs), providing `read`, `write`, `edit`, `deleteFile`, `list`, `glob`, and `grep` for a supplied sandbox session.

## Setup

```sh
npm i ai @ai-sdk/tool-fs @ai-sdk/sandbox-just-bash
```

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

See the [Filesystem Tools documentation](https://ai-sdk.dev/docs/ai-sdk-core/tools#filesystem-tools)
for the tools, options, and how searches work in different sandboxes.
