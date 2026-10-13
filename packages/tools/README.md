# AI SDK Tools

First-party tools for building agents and applications with the [AI SDK](https://ai-sdk.dev/docs).

This directory brings the SDK's first-party tools together in one place. Each
tool provides a ready-to-use implementation that plugs into `generateText`,
`streamText`, or `ToolLoopAgent` and works with any model that supports function
calling.

Import first-party tools from the shared `@ai-sdk/tools` package, or use their
individual `@ai-sdk/*-tool` packages when you only need a specific tool.

## Available tools

### Bash

[`@ai-sdk/bash-tool`](../bash-tool/README.md) lets agents run Bash commands to
search, analyze, and transform files. Bring your own sandbox using the just-bash
or Vercel Sandbox adapter, or supply a custom `Experimental_SandboxSession`.

```ts
import { bashTool } from '@ai-sdk/tools';

const bash = await bashTool({ sandbox });
```

The same tool is also available directly:

```ts
import { bashTool } from '@ai-sdk/bash-tool';
```

See the [Bash tool guide](../bash-tool/README.md) for installation, sandbox setup,
and usage examples.
