---
'@ai-sdk/openai-compatible': patch
---

fix(openai-compatible): keep raw `verbosity` provider option when `textVerbosity` is not set

Previously, an unset `textVerbosity` always wrote `verbosity: undefined` to the request body, which silently dropped a raw `verbosity` passed through provider options. `verbosity` is now only written from `textVerbosity` when it has a value; `textVerbosity` still takes precedence when both are set.
