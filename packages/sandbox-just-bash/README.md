# AI SDK - just-bash Sandbox

_This package is **experimental**._

Sandbox session implementation for [`just-bash`](https://github.com/vercel-labs/just-bash), an in-process JavaScript bash environment with a virtual filesystem.

`just-bash` sandboxes do not expose ports, so they cannot be used with features that require actual network sandboxes.

## Setup

```bash
npm i @ai-sdk/sandbox-just-bash
```

## Usage

Each creation produces a fresh in-memory sandbox and applies an optional harness template.

```ts
import { createJustBashNetworkSandboxSession } from '@ai-sdk/sandbox-just-bash';

const networkSandboxSession = await createJustBashNetworkSandboxSession({
  cwd: '/work',
});
const sandboxSession = networkSandboxSession.restricted();

await sandboxSession.writeTextFile({ path: '/work/hello.txt', content: 'hi' });

const { stdout } = await sandboxSession.run({
  command: 'cat /work/hello.txt',
});
console.log(stdout); // "hi"
await networkSandboxSession.destroy();
```

### Use cases

- Create a fresh in-memory session with `createJustBashNetworkSandboxSession()` and pass it to `HarnessAgent.createSession({ sandboxSession })`. An optional `sandboxId` only labels its wrapper and cannot enforce uniqueness.
- Take a network sandbox session's process-restricted subset with `networkSandboxSession.restricted()` and use it with AI SDK tools that accept `experimental_sandbox`.
- Adapt an existing native `Sandbox` with `createJustBashSandboxSessionFromNativeSandbox(nativeSandbox)` for AI SDK tools. `resumeJustBashNetworkSandboxSession()` reports that cross-process resume is unsupported.
