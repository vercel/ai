---
'ai': patch
'@ai-sdk/provider-utils': patch
---

security: prevent unbounded memory growth in download functions

The `download()` and `downloadBlob()` functions now enforce a default 1 GiB size limit when downloading from user-provided URLs. Downloads that exceed this limit are aborted with a `DownloadError` instead of consuming unbounded memory and crashing the process. The `abortSignal` parameter is now passed through to `fetch()` in all download call sites.

Added `maxDownloadSize` option to `transcribe()` and `experimental_generateVideo()` for configuring the download size limit.
