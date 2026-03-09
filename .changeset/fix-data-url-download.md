---
'ai': patch
---

fix(ai): prevent downloading data: URLs as remote resources

Data URLs (e.g., `data:image/png;base64,...`) are now correctly treated as inline base64 data instead of being passed to the download function. Previously, data URLs would cause a `DownloadError` because the SDK tried to download them as remote URLs.
