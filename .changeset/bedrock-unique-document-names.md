---
'@ai-sdk/amazon-bedrock': patch
---

fix(amazon-bedrock): make document names unique within a request

Bedrock Converse rejects requests that contain duplicate document names. Different filenames could sanitize to the same name (e.g. `rates.v1.pdf` and `rates.v2.pdf` both became `rates`), and repeated filenames were sent as-is, so these requests failed. Repeated names now get a numeric suffix such as `invoice (2)`.
