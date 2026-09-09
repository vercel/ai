# AI SDK OpenCode Harness

The OpenCode harness connects `HarnessAgent` to OpenCode through a sandboxed
bridge.

## Native OpenCode configuration

Use `openCodeConfig` to pass native OpenCode settings that do not have a
dedicated adapter option. For example, OpenCode supports selecting a model for
an individual agent:

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

Adapter-managed settings take precedence when the same key is present in
`openCodeConfig`. Agent-local `permission` and deprecated `tools` settings are
ignored so they cannot bypass harness permissions or built-in tool filtering.

See the AI SDK documentation for usage.
