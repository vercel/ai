---
'@ai-sdk/provider-utils': patch
---

Fix provider SSE response parsing in runtimes such as Expo React Native that lack `TextDecoderStream`, while preserving UTF-8 characters split across response chunks.
