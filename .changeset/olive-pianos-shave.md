---
'ai': patch
---

fix (ai): download deprecated `file-url` and `image-url` tool result content

Tool result content parts that use the deprecated `file-url` and `image-url`
types were converted to `file` parts with `{ type: 'url' }` data, but they were
never passed to the download function. When the model does not support the URL,
the provider received a bare URL instead of the file contents, even though the
replacement `file` part with `{ type: 'url' }` data was downloaded and inlined.
