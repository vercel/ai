---
"@ai-sdk/anthropic": patch
---

Defer construction of Anthropic provider option schemas until they are first used to reduce package import time.
