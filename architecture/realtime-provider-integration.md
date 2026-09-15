# Experimental realtime provider integration

This document is for runtime and provider authors. Application developers should
start with the OpenAI provider documentation. Client-delegated Live supports
server WebSockets and an optional browser WebRTC transport through `useRealtime`.

## Shared interface, provider-specific protocol

OpenAI Realtime and Live use the same `experimental_realtime` factory and implement
`Experimental_RealtimeModelV4`, but have distinct internal adapters. API selection
belongs in the OpenAI provider: an explicit `api` option wins, known Live IDs select
Live, and other model IDs retain the Realtime default. Runtime consumers inspect
the returned model's capabilities rather than matching provider model names.

Connection setup, conversation semantics, startup and finalization are independent
capabilities. Optional connection methods require a capability/method check. Existing
token-based providers retain their client-secret setup; selecting Live through
`experimental_realtime.getToken()` rejects before an unsupported mint request.

## Responsibilities

| Layer       | Responsibility                                                                      |
| ----------- | ----------------------------------------------------------------------------------- |
| Provider    | Endpoint/auth configuration, option validation, wire commands and event mapping     |
| Runtime     | Socket ownership, readiness, ordered delivery, bounded buffering, media and cleanup |
| Application | Authorization, tool execution policy, durable state and external side effects       |

For a server-owned WebSocket, `getServerWebSocketConfig()` supplies connection
settings; its credential-bearing headers remain server-side. The runtime sends
provider-serialized startup and commands and feeds incoming JSON into a fresh
`createServerEventParser()` for each connection. Discard that parser on disconnect.
Both parser entry points use pure mapping and return arrays, including for a single
normalized event. Unknown provider messages, including `response.event`, remain
`custom` events with the original payload in `raw`.

For WebRTC, the browser posts `{ sdp, sessionConfig }` to `api.session`. An
authenticated application endpoint calls `doCreateWebRTCSession()` with server-owned
delegation and data-channel permissions, returning only `{ sdp, sessionId }`.
The provider supplies the channel label through `getWebRTCConfig()`; audio is
negotiated through SDP rather than JSON PCM frames. Each attachment selects one
live sender track, preferring enabled/unmuted media, and observes that track without
automatic switching. SDK-owned tracks stop on cleanup; borrowed tracks only detach.

Both browser transports use the same attempt-scoped callbacks, client ACK tracker,
mode validation, and terminal-event drain. React actions and callbacks target the
committed owner. Peer disconnects have a bounded recovery grace period; failed ICE
is fatal, while autoplay failures can be retried through `resumePlayback()`.

Live accepts omitted, null, or `{ type: 'client' }` delegation at startup. The
application owns its agent and tools and sends context back with `context-append`.
Startup settings are immutable; `session-update` rejects. Native server mode metadata
maps to `client` or `provider`; a client-delegation runtime must reject a confirmed
`provider` mode before treating the session as ready.

## Semantics that must survive adaptation

- Preserve raw events, opaque IDs, transcript text and overlapping timestamps.
  Display rows are not authoritative voice turns.
- Preserve delegation IDs and optional target, offset, and response metadata without
  inferring relationships or inventing IDs.
- Replace cumulative voice duration snapshots rather than summing them.
- Install the terminal listener before sending a close command. Only the provider's
  terminal event confirms final usage; transport loss leaves the last snapshot
  unconfirmed. Do not replay side-effecting work automatically on reconnection.

The shared event/capability additions remain experimental. OpenAI-specific delegation
configuration, command channel selectors and native wire details stay in its provider
namespace. Connection and lifecycle capabilities remain model-wide so consumers can
select the supported transport and startup/finalization commands.
