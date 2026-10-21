---
'@ai-sdk/gateway': patch
'@ai-sdk/provider-utils': patch
---

feat(gateway): implement SpeechModelV4.doStream in the gateway provider

`GatewaySpeechModel` streams speech over the AI Gateway speech WebSocket (`/speech-model`, `ai-gateway-speech.v1` subprotocol). `@ai-sdk/provider-utils` adds the experimental speech-stream envelope (`experimental_parseSpeechStreamClientFrame`, `experimental_serializeSpeechStreamPart`, `experimental_parseSpeechStreamPart`) shared by clients and servers.
