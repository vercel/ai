---
'@ai-sdk/provider-utils': major
'@ai-sdk/openai': major
---

breaking(provider/openai): remove redundant `name` from custom tool args

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

`createToolNameMapping` from `@ai-sdk/provider-utils` no longer accepts the `resolveProviderToolName` parameter.
