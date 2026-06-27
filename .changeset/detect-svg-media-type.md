---
'@ai-sdk/provider-utils': patch
---

feat (provider-utils): detect SVG (image/svg+xml) in detectMediaType

`detectMediaType` is signature-based and previously had no entry for SVG, so SVG bytes returned `undefined` and callers like `generateImage` fell back to `image/png`. Add `<svg` and `<?xml` prefixes so SVG image output is detected correctly.
