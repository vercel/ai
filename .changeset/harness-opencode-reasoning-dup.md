---
'@ai-sdk/harness-opencode': patch
---

fix(harness-opencode): route OpenCode reasoning deltas to the reasoning part instead of duplicating them as text. OpenCode streams reasoning deltas under `field: "text"`, which the bridge previously emitted as `text-delta`, so the thinking was duplicated into the assistant's text.
