# OpenAI Live with useRealtime

Set `OPENAI_API_KEY` on your server. From `examples/ai-functions`, start the local
WebSocket relay:

```sh
pnpm tsx src/realtime/openai/live-relay.ts
```

Start `examples/ai-e2e-next` with `pnpm dev`, then open `/realtime-live`. The page
defaults to `ws://localhost:4318/live`. For another frontend origin, set
`ALLOWED_ORIGIN` on the relay. The example listens only on loopback. Use TLS (`wss`)
and authenticated upgrades for a deployed application; the local origin check is
not user authentication.

The hook owns paced PCM16 capture/playback and uses the OpenAI provider to serialize
and parse events. The relay supplies server credentials and forwards ordered text
frames, with bounded buffering. It has a ten-minute safety deadline; use the page's
End button to finalize usage before that deadline. A relay deadline or dropped
connection leaves final usage unconfirmed.

The example opts into automatic tool continuation with `autoContinueTools: true`.
Responses mode supports hosted web search and a local `get_time` function. Send a
typed request with **Send to backend** to exercise the tool loop. Client mode exposes
delegations and context appends; application-owned agents can return results through
the same commands. Captions remain timestamped fragments rather than completed turns.

The browser WS runtime currently supports PCM16 only. The low-level provider also
supports G.711 for applications supplying their own encoded streams. Read authoritative
voice seconds from `session.usage` and `session.finalization`, separately from `backendUsage`.
