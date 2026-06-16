---
'ai': patch
---

Add `allowSystemInMessages` option to `ToolLoopAgent`.

This exposes the same option that exists on `streamText` and `generateText`, whether `role: "system"` messages are allowed in the `prompt` or `messages` fields. When unset, system messages are rejected because they can create a prompt injection attack risk. Ideally, use the `instructions` option instead. Set to `true` to allow system messages, or `false` to explicitly reject them.

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
