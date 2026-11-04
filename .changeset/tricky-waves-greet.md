---
"@ai-sdk/anthropic": patch
"@ai-sdk/provider": patch
"ai": patch
---

Add typed streaming heartbeat parts. Anthropic emits them only with `includePings: true` (disabled by default), without requiring raw chunks. Core forwards pings through stream retries without storing them as generated content or sending them to UI message streams. Consumers with exhaustive stream-part switches must handle the new `ping` union variant when upgrading, even when the opt-in is disabled. Typed pings do not flush partial words during stream smoothing.
