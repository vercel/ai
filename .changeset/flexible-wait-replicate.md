---
'@ai-sdk/replicate': patch
---

feat(replicate): add configurable maxWaitTimeInSeconds option for image generation

Added `maxWaitTimeInSeconds` provider option to control sync wait duration for Replicate image predictions:

- When not specified: Uses default 60-second sync wait (`prefer: wait`)
- When set to a positive number: Uses that duration (`prefer: wait=N`)

This allows longer predictions to complete by extending the sync timeout beyond the default 60 seconds.
