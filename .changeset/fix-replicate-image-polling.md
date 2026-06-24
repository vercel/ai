---
'@ai-sdk/replicate': patch
---

fix(replicate): poll for completion when sync-wait times out on image generation

When Replicate's sync-wait API returns `status: starting` or `status: processing` (e.g. during cold starts or long inferences), the image model now polls `urls.get` until the prediction succeeds, fails, or is canceled — matching the existing behavior of the video model.

Added `pollIntervalMs` (default 2000ms) and `pollTimeoutMs` (default 5 minutes) provider options to configure polling behavior.
