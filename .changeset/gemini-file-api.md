---
'@ai-sdk/google': patch
---

feat(google): add Gemini File API support for large media files

Adds `google.files` client for uploading and managing files up to 2GB via the Gemini File API. This enables processing large videos, audio files, and documents that exceed the 20MB inline request limit.

New methods:

- `upload()` - Upload files using resumable upload protocol
- `get()` - Get file metadata and processing state
- `list()` - List uploaded files with pagination
- `delete()` - Delete files before 48-hour auto-expiration
- `waitForProcessing()` - Poll until video/audio processing completes
