---
'ai': patch
---

fix: call onFinish callback when stream is aborted in toUIMessageStream

Previously, the onFinish callback was only called when the stream completed normally via the flush() method. This caused issues in chat interfaces where users might close the browser window, navigate away, or lose connection - in these cases, partial messages were not persisted to the database.

This fix ensures onFinish is called with isAborted: true when an abort event is received, allowing applications to properly handle and persist partial messages. The callback is guaranteed to be called only once, either on abort or normal completion.
