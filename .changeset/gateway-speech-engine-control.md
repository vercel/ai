---
"@ai-sdk/gateway": patch
"ai": patch
---

Add a shared speech-engine control protocol for Gateway-owned realtime voice. Exposes the wire contract (subprotocol, event codec, capabilities, and engine descriptor) plus a `GatewaySpeechEngineSession` controller helper so a client can implement a "bring your own brain" voice endpoint in a few lines: surface finalized transcripts, stream a reply back for TTS, and get implicit barge-in (a new transcript aborts and cancels the prior turn by id). `experimental_realtime.getToken` now accepts an optional `control` config that is sealed into the minted client secret, and `GatewayRealtimeControlConfig` is re-exported from `ai`.
