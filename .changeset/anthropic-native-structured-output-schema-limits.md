---
"@ai-sdk/anthropic": patch
---

fix(anthropic): keep the JSON response tool for schemas that native structured outputs cannot represent when upgrading models that reject forced tool use. Schemas with open objects (maps, free-form objects) would otherwise come back as `{}`, and schemas with more than 12 optional properties can be rejected as too complex.
