---
'ai': patch
---

Fixed infinite `streamStep` loop when provider-executed tools with deferred results fail. The `pendingDeferredToolCalls` map now correctly clears entries on `tool-error` in addition to `tool-result`, preventing endless stream invocations after tool failures.
