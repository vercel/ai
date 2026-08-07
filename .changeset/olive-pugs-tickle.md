---
'@ai-sdk/xai': patch
---

chore(xai): drop the unused `@ai-sdk/openai-compatible` dependency

This provider was originally built on the shared openai-compatible model and
has since been rewritten to implement its own, with its own tool preparation,
finish-reason mapping and response metadata helpers. Nothing in the package
imports `@ai-sdk/openai-compatible` any more, but the dependency and the
TypeScript project reference to it were both left behind. No runtime change.
