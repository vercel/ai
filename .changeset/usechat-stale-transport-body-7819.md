---
'@ai-sdk/react': patch
---

fix(react): refresh transport across renders in `useChat`

`useChat` previously captured the `transport` (and any `body` / `headers` baked into it) on the first render, so inline transports closing over component state would send stale values. Delegate through a stable transport ref so each request uses the latest transport instance.

Fixes #7819
