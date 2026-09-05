---
'@ai-sdk/provider-utils': patch
'ai': patch
---

fix useChat stream stall on Linux WebKit under concurrent contexts

Replace `TextDecoderStream` with a custom `TextDecoder`-based transform in `parseJsonEventStream` to avoid a Linux WebKit `pipeThrough` deadlock that stalled ~30% of concurrent browser contexts. Add `cache: no-store` to `HttpChatTransport` fetches to prevent WebKit HTTP-cache serialization of concurrent POSTs.
