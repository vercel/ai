---
'ai': patch
'@ai-sdk/react': patch
---

fix(ui): lazily generate chat id to avoid Math.random() during Next.js prerender (#23400)

`useChat()` without an explicit `id` now lazily evaluates and initializes the session `id` outside of render, avoiding evaluation of `Math.random()` during component render and enabling Client Components using default `useChat()` to successfully prerender when Next.js Cache Components (`cacheComponents: true`) is enabled.
