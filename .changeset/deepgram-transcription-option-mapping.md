---
"@ai-sdk/deepgram": patch
---

fix(deepgram): send parsed transcription options to the API

`keyterm`, `paragraphs`, `intents`, `sentiment`, and `replace` were accepted
in `providerOptions.deepgram` but silently dropped from the `/v1/listen`
request. They are now sent as query parameters. Also widens the provider
callable signature from `'nova-3'` to any transcription model ID.
