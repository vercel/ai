---
'@ai-sdk/gateway': patch
---

fix(gateway): return large generated images as `Uint8Array` to cut peak memory

The image model reads its response as a stream and decodes images of 64 KiB and more while they arrive, which avoids holding about four copies of the response body in memory. They are returned as `Uint8Array` instead of base64 strings; smaller images stay base64 strings, and when a result mixes both, all images are returned as `Uint8Array`.

This departs from `image-model-v4-result.ts` ("If the API returns base64 encoded strings, the images should be returned as base64 encoded strings"): returning strings would mean holding the base64 string, which is what this change avoids, and consumers that want bytes would decode it a second time.
