---
'ai': patch
---

Add `allowSystemInMessages` option to `ToolLoopAgent`.

This exposes the same option that exists on `streamText` and `generateText`, allowing messages with `role: "system"` in the `messages` array when set to `true`. This is useful for trusted, server-generated `role: "system"` messages in conversation history.

```ts
const agent = new ToolLoopAgent({
  model,
  allowSystemInMessages: true,
});

await agent.generate({
  messages: [
    { role: 'system', content: 'Server context' },
    { role: 'user', content: 'Hello' },
  ],
});
```

The option can also be returned from `prepareCall` for dynamic per-call configuration.
