---
'ai': patch
---

Preserve `providerMetadata` on every chunk emitted by `smoothStream` — previously only the first chunk of a word-boundary burst carried the metadata (e.g. Anthropic thinking signatures), causing downstream consumers to lose it.
