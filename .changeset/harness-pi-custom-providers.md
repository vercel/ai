---
"@ai-sdk/harness-pi": patch
---

feat(harness-pi): add `providers` option to register custom providers (incl. OAuth/subscription) per session

`createPi({ providers })` registers caller-supplied providers into each session's `ModelRegistry`/`AuthStorage` before model resolution. A `credential` seeds `AuthStorage` (OAuth or API key) and a `config` is passed to `ModelRegistry.registerProvider`, so a host can use OAuth/subscription credentials (e.g. an `openai-codex` ChatGPT-subscription token) or fully custom providers for a catalog model without the `auth.customEnv` API-key path. Registered provider names are preferred during model resolution when a model id is published under multiple providers, and an optional `onCredentialRefresh` callback lets a long-running host persist credentials renewed by Pi's automatic OAuth refresh.
