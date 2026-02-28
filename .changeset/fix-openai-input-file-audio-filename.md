---
'@ai-sdk/openai': patch
---

fix(openai): preserve file extension in default filenames and guard against silent audio routing on Responses path.

- Default filename for `file` parts without an explicit `filename` now derives an extension from the MIME type (e.g. `part-0.pdf` instead of `part-0`). Applies to both chat completions and responses paths.
- Audio file parts on the Responses API path now throw `UnsupportedFunctionalityError` instead of silently falling through to `input_file`, which would produce confusing API-level errors.
