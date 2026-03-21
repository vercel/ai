---
'@ai-sdk/react': patch
---

fix(react): prevent stale body/headers/api in `useChat` when transport is recreated each render

Previously, when users created a new `DefaultChatTransport` (or any `ChatTransport`) on every render—typically to pick up updated React state in `body`, `headers`, or `api`—`useChat` would silently ignore those updates. The `Chat` instance was created once on mount and stored in a ref, so it always used the transport from the initial render.

This fix applies the same "stable proxy" pattern already used for callbacks (`onToolCall`, `onFinish`, etc.): a proxy transport is created once and stored in a ref, but it always delegates to whichever transport is current. Because the current transport ref is updated on every render, the proxy automatically picks up the latest values without requiring `Chat` to be recreated.

**Before (broken):**

```tsx
const [subagent, setSubagent] = useState('todos-agent');

useChat({
  transport: new DefaultChatTransport({
    body: { subagent }, // always stale — Chat captured the first value
  }),
});
```

**After (fixed):**

```tsx
const [subagent, setSubagent] = useState('todos-agent');

useChat({
  transport: new DefaultChatTransport({
    body: { subagent }, // always current — proxy delegates to latest transport
  }),
});
```

Fixes #7819.
