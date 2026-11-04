# AI SDK - OpenCode Harness

The OpenCode harness connects `HarnessAgent` to OpenCode through a sandboxed
bridge.

-> **Note**: This package is experimental.

## Setup

```bash
npm i @ai-sdk/harness @ai-sdk/harness-opencode @ai-sdk/sandbox-vercel
```

## Usage

```ts
import { createOpenCode } from '@ai-sdk/harness-opencode';

const adapter = createOpenCode({
  openCodeConfig: {
    agent: {
      general: {
        model: 'provider/model-id',
      },
    },
  },
});
```

See the [OpenCode harness documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/opencode) for more information.
