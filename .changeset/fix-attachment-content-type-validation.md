---
'ai': patch
---

Validate `FilePart.mediaType` against the byte-level signature of the supplied
data to prevent filetype whitelist bypass when attaching files. A caller
could previously claim `mediaType: "image/png"` while supplying bytes of
another type (e.g. a script or executable), which would then be processed
or persisted under the wrong MIME type. The fix uses the existing
`detectMediaType` magic-byte sniffer to cross-check the declared type against
the actual data, throwing `InvalidDataContentError` on mismatch. Wildcard
subtypes (e.g. `image/*`) and unknown formats are still permitted
(fail-open) to preserve existing flexibility.
