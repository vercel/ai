---
'@ai-sdk/elevenlabs': patch
'@ai-sdk/test-server': patch
---

fix (provider/elevenlabs): don't send `diarize` twice when it is set explicitly

The model always appended a default `diarize=true`, then appended the caller's value on top,
so the request carried the field twice and an explicit `diarize: false` was left for the server
to disambiguate. It now overwrites the default instead.

fix (test-server): keep repeated multipart fields instead of dropping all but the last

`requestBodyMultipart` overwrote entries on each key, so a repeated field (how multipart
encodes an array, e.g. OpenAI's `timestamp_granularities[]`) collapsed to its final value and
could not be asserted on. Repeated keys now collect into an array; single keys are unchanged.
