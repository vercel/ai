---
"@ai-sdk/react": patch
---

feat(react): support async/function headers in useObject

The `useObject` hook now accepts headers as an async function, enabling dynamic header generation (e.g., fetching auth tokens) without causing the hook to re-render.

Example usage:

```tsx
const { submit } = experimental_useObject({
  api: '/api/generate',
  schema: z.object({ content: z.string() }),
  headers: async () => {
    const token = await getAuthToken();
    return { Authorization: `Bearer ${token}` };
  },
});
```

This provides parity with `useChat` and resolves issues with infinite loops when using state-based headers with `useEffect`.

Closes #11637
