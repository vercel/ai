---
'ai': patch
---

fix(ai): throw `InvalidResponseDataError` instead of a generic `Error` when an audio format cannot be determined

`DefaultGeneratedAudioFile` previously threw a plain `Error` when it could not derive a format from the media type, so callers could not detect it with `AISDKError.isInstance`. It now throws `InvalidResponseDataError` (an `AISDKError`), consistent with the rest of the SDK's error handling.
