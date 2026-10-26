---
'ai': patch
'@ai-sdk/azure': patch
'@ai-sdk/deepinfra': patch
'@ai-sdk/google': patch
'@ai-sdk/google-vertex': patch
'@ai-sdk/openai': patch
'@ai-sdk/openai-compatible': patch
'@ai-sdk/prodia': patch
'@ai-sdk/tool-web-fetch': patch
---

Forward the provider's configured fetch transport when downloading file inputs. Add a `fetch` option to `createDownload` so core downloads can also use `guarded-fetch` for opt-in DNS validation on Node.js. Document that the default URL checks do not resolve DNS and recommend the guarded transport or network egress controls for untrusted URLs.

Keep Azure image and Vertex tool-result downloads separate from provider authentication wrappers so file hosts never receive Azure bearer tokens or Vertex Express Mode API keys.
