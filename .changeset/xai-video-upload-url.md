---
'@ai-sdk/xai': patch
---

Support typed `output.uploadUrl` delivery for video generation, editing, and extension. Polling returns an explicit uploaded outcome without downloading or exposing the signed destination, including in request errors. Use camelCase `output.uploadUrl` instead of raw `output.upload_url` passthrough; the new option rejects null and requires an HTTPS URL.
