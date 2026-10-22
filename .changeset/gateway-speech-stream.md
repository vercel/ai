---
'@ai-sdk/gateway': patch
'@ai-sdk/provider-utils': patch
---

feat(gateway): implement experimental streaming speech in the gateway provider

`GatewaySpeechModel` implements `Experimental_StreamingSpeechModelV4` and streams speech over the AI Gateway speech WebSocket (`/speech-model`, `ai-gateway-speech.v1` subprotocol). `@ai-sdk/provider-utils` adds the experimental speech-stream envelope (`experimental_parseSpeechStreamClientFrame`, `experimental_serializeSpeechStreamPart`, `experimental_parseSpeechStreamPart`) shared by clients and servers: text-delta frames carry each text part's `voice` and `providerOptions`, and the start frame's `outputFormat` is a `SharedV4AudioFormat`. Adds `gateway.experimental_speech`, callable like `speech(modelId)`, with a server-side `getToken()` that mints a speech-bound short-lived client secret for browser use.
