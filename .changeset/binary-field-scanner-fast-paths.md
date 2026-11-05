---
'@ai-sdk/provider-utils': patch
---

Speed up the streaming extraction of binary fields (`experimental_binaryFields`, used by `experimental_streamingImageDecoding` of the gateway): base64 is decoded four characters at a time, and strings that are not extracted are passed over with native searches. A 20 MiB image is extracted about 2.5× faster on Node 24 and 2× faster on Bun; the results are unchanged.
