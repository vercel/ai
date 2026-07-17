---
'@ai-sdk/openai': patch
'@ai-sdk/open-responses': patch
---

fix(provider/openai, provider/open-responses): throw a descriptive error when the Responses API returns a 200 with no `output`

A successful (200) Responses body missing the `output` array previously threw an opaque `output is not iterable` TypeError from `doGenerate`. Both providers now surface a clear `APICallError` ("Responses API returned no output …"), including the incomplete-details reason (and status, for open-responses) when present. When the body includes a `response.error`, its message is surfaced first so upstream error details aren't masked by the generic fallback. This makes malformed/incomplete upstream responses actionable instead of a cryptic crash.
