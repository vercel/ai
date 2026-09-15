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
End button to request final usage before that deadline. Relay failures and timeouts
close with code `1011`; congestion closes with `1013`. A normal upstream `1000`
close is forwarded as `1000`, and client shutdown closes the upstream. Close reasons
are sanitized; upstream error text is never forwarded as a close reason.

The page uses a stable `openai.experimental_realtime('gpt-live-1')` model with
`providerOptions.openai.delegation: { type: 'client' }`. Voice instructions are
editable before connecting. The application handles delegation: inspect client
delegation metadata, choose a known client delegation or **Session-wide**, and
manually append context or a result. The SDK does not execute a Live agent/tool
loop. Any text conversation, agent context, execution, and result validation belong
to the application. Metadata is not a source of invented task arguments.

Context channels are `commentary`, `thinking`, and `instructions`. Use `instructions`
only for trusted application instructions. Local send completion does not prove
provider acceptance, speech, or audible delivery. Captions remain timestamped
fragments in `session.transcripts`, rather than completed `messages` turns.

**Stop local capture** releases the SDK-owned microphone; **Resume local capture**
acquires a new one without reconnecting. A caller-supplied Live stream would instead
remain caller-owned and only be detached on stop. **Mute provider input** changes
remote processing after acknowledgment and does not release the microphone; local
capture and protocol mute are independent. Playback can also be resumed independently.

For borrowed streams, `isCapturing` reflects SDK controls and selected-track events.
An owner assigning `track.enabled` or calling `track.stop()` emits no corresponding
change event (`stop()` does not emit `ended`). Call `startAudioCapture(stream)` or
`resumeAudioCapture()` after external changes to refresh or reattach capture;
replace stopped tracks with live ones. External track state is not polled.

The browser WS runtime currently supports PCM16 only. The low-level provider also
supports G.711 for applications supplying their own encoded streams. Read authoritative
voice seconds from `session.usage` and check `session.finalization`. Only a terminal
provider event parsed by the provider can confirm finalization; neither relay close
code `1000` nor a fulfilled `close()` promise confirms usage. A timeout or dropped
connection without that event leaves usage unconfirmed. The relay forwards frames
without inventing terminal events or usage. Download evidence to inspect session
state and normalized events (audio payloads are omitted from that event log).
