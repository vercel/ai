# AI SDK - Bash Tool

A first-party, provider-independent bash tool for the [AI SDK](https://ai-sdk.dev/docs).

## Setup

```bash
npm i ai @ai-sdk/tool-bash @ai-sdk/sandbox-just-bash
```

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

See the [Bash Tool documentation](https://ai-sdk.dev/docs/ai-sdk-core/tools#bash-tool) for more information.
