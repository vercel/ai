---
'@ai-sdk/deepinfra': patch
---

fix (provider/deepinfra): only rewrite the trailing /inference when building the image edit URL

`getEditUrl()` replaced the first `/inference` in the configured baseURL, so a custom
`baseURL` whose own path contains `/inference` had the wrong segment rewritten and the
appended one left in place.
