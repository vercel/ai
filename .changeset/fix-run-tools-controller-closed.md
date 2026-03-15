---
'ai': patch
---

fix(ai): guard toolResultsStreamController in run-tools-transformation against enqueue/close on already-closed controller

When the LLM model stream errors while tools are still executing asynchronously, the cancellation cascade closes `toolResultsStreamController` before pending tool promise callbacks fire. This causes an unhandled `TypeError [ERR_INVALID_STATE]: Invalid state: Controller is already closed` that crashes the Node.js process.

Added `safeEnqueue`/`safeClose` wrappers with a closed-state flag and a `cancel()` handler on `toolResultsStream` to gracefully handle late-arriving tool results.
