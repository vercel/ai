---
'ai': patch
---

Throw `InvalidResponseDataError` instead of a generic `Error` when a generated audio file's format cannot be determined from its media type, so callers can identify the failure with `AISDKError.isInstance`.
