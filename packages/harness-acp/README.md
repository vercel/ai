# @ai-sdk/harness-acp

Generic [Agent Client Protocol](https://agentclientprotocol.com/) harness for AI SDK `HarnessAgent`.

Runs ACP stdio agents inside Vercel Sandbox via a WebSocket NDJSON bridge (stdin is not exposed to the host through sandbox `spawn`).

## Usage

```ts
import { createAcpHarness } from '@ai-sdk/harness-acp';

const harness = createAcpHarness({
  harnessId: 'my-agent',
  getBootstrap: async () => ({ /* HarnessV1Bootstrap */ }),
  command: 'my-agent acp',
  authMethodId: 'my.auth',
});
```

Prefer `@ai-sdk/harness-grok` or `@ai-sdk/harness-cursor` for known CLIs.