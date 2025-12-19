---
'@ai-sdk/replicate': patch
---

feat(replicate): add configurable maxWaitTimeInSeconds option for image generation

Added `maxWaitTimeInSeconds` provider option to control sync wait behavior for Replicate image predictions:

- When not specified: Uses default 60-second sync wait (`prefer: wait`)
- When set to a positive number: Uses that duration (`prefer: wait=N`)
- When set to 0: Disables sync mode (no `prefer` header), returning immediately with a prediction in "starting" or "processing" state

This allows longer predictions to complete and provides control over the sync/async behavior.
