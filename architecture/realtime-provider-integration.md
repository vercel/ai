# Experimental realtime provider integration

This document is for runtime and provider authors. Application developers should
start with `experimental_useRealtime` and the provider documentation.

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
| React       | State subscriptions and application controls                                        |
| Application | Authorization, tool execution policy, durable state and external side effects       |

For a server-owned WebSocket, `getServerWebSocketConfig()` supplies connection
settings; its credential-bearing headers remain server-side. The runtime sends
provider-serialized startup and commands and feeds incoming JSON into a fresh
`createServerEventParser()` for each connection. Discard that parser on disconnect.
The stateless `parseServerEvent()` remains useful for isolated events, but cannot
infer correlation requiring earlier events. The OpenAI implementation returns arrays
from both entry points, including for a single normalized event.

## Semantics that must survive adaptation

- Preserve raw events, opaque IDs, transcript text and overlapping timestamps.
  Display rows are not authoritative voice turns.
- Correlate delegated backend items through response identity; do not interpret
  empty terminal output snapshots as proof that no function results are pending.
- Keep voice duration and backend token/tool usage separate. Replace cumulative
  duration snapshots rather than summing them; deduplicate backend completions.
- Install the terminal listener before sending a close command. Only the provider's
  terminal event confirms final usage; transport loss leaves the last snapshot
  unconfirmed. Do not replay side-effecting work automatically on reconnection.

The shared event/capability additions remain experimental. OpenAI-specific delegation
configuration, command channel selectors and native wire details stay in its provider
namespace. A unified public factory is not a claim that other providers implement
OpenAI's backend workflow.

## Optional browser-direct WebRTC

The provider's `doCreateWebRTCSession()` performs the server-authenticated HTTP SDP
exchange and returns the session ID and SDP answer. The browser runtime owns the
peer connection, data channel and media tracks. WebRTC setup is already session
startup, so no second startup command belongs on the data channel. It does not use
OpenAI Realtime client-secret minting or require a WebRTC media server in the app.

Application authentication protects the HTTP setup endpoint. The server owns
`client.dataChannel` permission policy and must not accept browser overrides.
Filtering out lifecycle events can prevent readiness or confirmed finalization;
the runtime must report that limitation rather than silently widening permissions.
