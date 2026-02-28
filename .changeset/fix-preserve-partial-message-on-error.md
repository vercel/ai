---
'ai': patch
---

fix(ui): preserve partial message and metadata on stream error in useChat

When a stream error occurred during `useChat`, the partial message being built (including any `messageMetadata`) was discarded and not persisted to the `messages` array. This led to data loss and an inconsistent state where data existed in memory but was permanently lost when `activeResponse` was cleared.

The fix persists the latest `activeResponse.state.message` to the messages array in the catch block before setting the error state, ensuring partial content and metadata are retained for error display, logging, or recovery.

Fixes #7562
