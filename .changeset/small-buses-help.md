---
'@ai-sdk/provider-utils': major
'@ai-sdk/openai': major
---

### `@ai-sdk/openai`: remove redundant `name` argument from `openai.tools.customTool()`

`openai.tools.customTool()` no longer accepts a `name` field. the tool name is now derived from the sdk tool key (the object key in the `tools` object).

migration: remove the `name` property from `customTool()` calls. the object key is now used as the tool name sent to the openai api.

before:

```ts
tools: {
  write_sql: openai.tools.customTool({
    name: 'write_sql',
    description: '...',
  }),
}
```

after:

```ts
tools: {
  write_sql: openai.tools.customTool({
    description: '...',
  }),
}
```

### `@ai-sdk/provider-utils`: `createToolNameMapping()` no longer accepts the `resolveProviderToolName` parameter

before: tool name can be set dynamically

```ts
const toolNameMapping = createToolNameMapping({
  tools,
  providerToolNames: {
    'openai.code_interpreter': 'code_interpreter',
    'openai.file_search': 'file_search',
    'openai.image_generation': 'image_generation',
    'openai.local_shell': 'local_shell',
    'openai.shell': 'shell',
    'openai.web_search': 'web_search',
    'openai.web_search_preview': 'web_search_preview',
    'openai.mcp': 'mcp',
    'openai.apply_patch': 'apply_patch',
  },
  resolveProviderToolName: tool =>
    tool.id === 'openai.custom'
      ? (tool.args as { name?: string }).name
      : undefined,
});
```

after: tool name is static based on `tools` keys

```
const toolNameMapping = createToolNameMapping({
  tools,
  providerToolNames: {
    'openai.code_interpreter': 'code_interpreter',
    'openai.file_search': 'file_search',
    'openai.image_generation': 'image_generation',
    'openai.local_shell': 'local_shell',
    'openai.shell': 'shell',
    'openai.web_search': 'web_search',
    'openai.web_search_preview': 'web_search_preview',
    'openai.mcp': 'mcp',
    'openai.apply_patch': 'apply_patch',
  }
});
```
