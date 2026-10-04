---
'@ai-sdk/provider-utils': patch
---

fix(provider-utils): limit the JSON Lines parser buffer to 10 MiB so a response that keeps streaming without a newline throws an `APICallError` instead of running the process out of memory
