---
'@ai-sdk/azure': patch
---

Add MAI-Voice-2-Flash, MAI-Voice-2, and MAI-Voice-1 speech generation through `azure.speech()` using Azure Speech text to speech (SSML), with voice, output format, speed, and `style`/`styleDegree` provider options. Select the API with `providerOptions.azure.api` to override model-based routing, and add `azure.speechModel()` as an alias of `azure.speech()`.
