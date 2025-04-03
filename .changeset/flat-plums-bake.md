---
'ai': minor
---

Add `finishReason` field to `NoObjectGeneratedError`, this can help clarify why an error occurred. `cause` is not always enough to determine the exact reason.

For example if the max token size was reached, the (JSON) response will be incomplete. `cause` will be a `JSONParseError`, but the root cause is the token size which has been reached.
By adding `finishReason` (which info is already available where we throw the error) we can see that the value is 'length' and that the max token size has been reached.
