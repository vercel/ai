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

## Compaction events

Native automatic and manual compaction emit a `compaction` stream part on
completion. Internal summary text is available on that part, rather than
streamed as assistant answer text. Summary model usage is preserved.

With `includeRawChunks` enabled, `opencode.compaction` raw events expose
`messageId` and `status` (`started` or `failed`). Successful completion uses
the normalized `compaction` part, whose `harnessMetadata.opencode.messageId`
identifies the same operation.

See the AI SDK documentation for usage.
