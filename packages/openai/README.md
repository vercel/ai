# AI SDK - OpenAI Provider

The **[OpenAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai)** for the [AI SDK](https://ai-sdk.dev/docs)
contains language model support for the OpenAI chat and completion APIs and embedding model support for the OpenAI embeddings API.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access OpenAI (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

The OpenAI provider is available in the `@ai-sdk/openai` module. You can install it with

```bash
npm i @ai-sdk/openai
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Provider Instance

You can import the default provider instance `openai` from `@ai-sdk/openai`:

```ts
import { openai } from '@ai-sdk/openai';
```

## Example

```ts
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const { text } = await generateText({
  model: openai('gpt-5-mini'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

## Documentation

### Experimental Live conversations

`openai.experimental_live('gpt-live-1')` implements the existing
`Experimental_RealtimeModelV4` specification with continuous conversation semantics.
This provider supplies transport configuration and event conversion for realtime
runtimes. The primary low-level path below uses an application-owned server
WebSocket, audio capture/playback, and delegated work.

#### React sessions

`experimental_useRealtime` supports Live through a WebSocket relay. Keep the model and
session configuration stable (module scope or `useMemo`); replacing either object
replaces the hook's session.

```tsx
import { openai } from '@ai-sdk/openai';
import { experimental_useRealtime as useRealtime } from '@ai-sdk/react';

const model = openai.experimental_live('gpt-live-1');
const sessionConfig = { instructions: 'Be a concise, friendly assistant.' };

function Conversation() {
  const rt = useRealtime({
    model,
    api: { websocket: 'wss://your-app.example/live' },
    sessionConfig,
  });

  return (
    <>
      <button onClick={() => rt.connect()}>Connect microphone</button>
      <button onClick={() => rt.close()}>End conversation</button>
      <p>
        {rt.status} · {rt.session?.usage?.seconds} seconds
      </p>
    </>
  );
}
```

The relay holds server credentials and forwards native provider text frames in
both directions. Never expose the OpenAI project key in its URL or subprotocols.
The hook requests microphone access, sends startup configuration, and starts paced
PCM16 capture only after `session-started`. Browser WebSocket capture/playback supports
PCM16; use the low-level provider for application-owned G.711 streams.

Existing realtime models continue using `api: { token: ... }`.

Wait for `status === 'connected'` before sending commands. `connect({ stream })`
accepts a caller-owned media stream; the SDK releases but does not stop those tracks.
`close()` drains until final usage or `closeTimeoutMs` (15 seconds by default).
Read `session.finalization` to distinguish `confirmed` from `unconfirmed` close;
`disconnect()` and component unmount force cleanup. `resumePlayback()` retries
playback after a browser autoplay restriction.

`session.transcripts` preserves exact fragments and overlapping timestamps;
`session.delegations` exposes application work requests. Client delegation remains
application-controlled through `onEvent` and `context-append`. In Responses mode,
`onToolCall` can return a result for automatic submission, or `undefined` to supply
it later through `addToolOutput()`. Set `autoContinueTools: true` to automatically
continue once all function results have been submitted; this is off by default for
Live. Otherwise send `backend-response-create` explicitly after the pending results.
The runtime ignores stale automatic results
after reconnection. `sendTextMessage()` supplies backend text, not a voice turn.
`session.backendUsage` is separate from cumulative voice duration. The hook retains
bounded event/transcript/usage history (`maxEvents`); archive via `onEvent` if needed.

Capture can be stopped and restarted without replacing the session: use
`stopAudioCapture()`, `startAudioCapture(stream)`, or `resumeAudioCapture()`.
`connect({ capture: false })` leaves capture application-managed. Provider input
mute is separate from local microphone capture. A playback buffer overflow drops
stale local audio and reports a recoverable gap; `resumePlayback()` restarts at the
live edge without closing the conversation. See the
[hook reference](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-realtime) for lifecycle,
timeouts, ownership, and experimental API compatibility.

Runnable examples: `examples/ai-e2e-next/app/realtime-live` and
`examples/ai-functions/src/realtime/openai/live-relay.ts`.

#### Headless sessions

```ts
import {
  createOpenAI,
  type Experimental_OpenAIRealtimeModelLiveOptions as OpenAIRealtimeModelLiveOptions,
} from '@ai-sdk/openai';

const model = createOpenAI().experimental_live('gpt-live-1');
const liveOptions = {
  delegation: {
    type: 'responses',
    responses: {
      model: 'gpt-5.6-luna',
      tools: [{ type: 'web_search' }],
      toolChoice: 'auto',
    },
  },
} satisfies OpenAIRealtimeModelLiveOptions;
const sessionConfig = {
  instructions: 'Be concise. Delegate questions needing current information.',
  voice: 'marin',
  providerOptions: { openai: liveOptions },
};

// Server only: connect using a WebSocket implementation with header support.
const { url, headers } = await model.getServerWebSocketConfig();
const parseServerEvent = model.createServerEventParser();
const firstMessage = model.serializeClientEvent({
  type: 'session-start',
  config: sessionConfig,
  eventId: 'start-1',
});
// Send JSON.stringify(firstMessage) after the socket opens.
// Feed decoded JSON objects to parseServerEvent(raw) in arrival order.
```

WebSocket connects to `/v1/live/sessions` and requires a `session-start` command.
Wait for `session-started` before streaming `input-audio-append` commands containing
base64 audio. Input and output share one format: PCM16 at 24 kHz (default) or
16 kHz, or G.711 `audio/pcmu` / `audio/pcma` at 8 kHz. Set
`inputAudioFormat` and/or `outputAudioFormat` to `{ type, rate }`; when both are
provided they must match. The adapter does not resample audio.

Create one parser per connection, including when reusing a model instance. Discard
the parser on disconnect and create a fresh one for a reconnect. This works on a
headless server without browser APIs. `model.parseServerEvent(raw)` remains stateless
for inspecting individual events, but use `createServerEventParser()` to normalize
granular backend function calls that lack their own response ID. Both public parser
methods always return arrays, including for a single normalized event.

Keep API keys and the headers from `getServerWebSocketConfig()` on the server.
Live implements server WebSocket connections; it does not expose `doCreateClientSecret` or
`getWebSocketConfig`. Those methods are optional in the shared specification;
generic callers must check for them. Existing concrete realtime providers retain
their token methods.

Live declares `capabilities.connections: ['server-websocket']`,
`startup: 'session-start'`, and `finalization: 'session-close'`. When these
optional capabilities are omitted, legacy defaults are client-secret WebSocket,
`session-update` startup, and transport-close finalization; continuous conversation
semantics alone do not determine them.

`Experimental_OpenAIRealtimeModelLiveOptions` is a validated startup subset using
camelCase fields. Only the provider converts these to OpenAI wire names:

- `delegation`: `{ type: 'client' }`, `null` (client mode), or
  `{ type: 'responses', responses: { ... } }`. Responses startup requires `model`.
  Supported settings are `model`, `instructions`, function tools and hosted
  `web_search` tools, `toolChoice` (`auto`, `none`, `required`, or
  `{ type: 'function', name }`), `parallelToolCalls`,
  `maxOutputTokens` (at least 16), and `serviceTier` (`auto`, `default`, `flex`, `priority`).
  Function tools use `{ type: 'function', name, parameters?, description?, strict? }`,
  where `parameters` is a JSON Schema object, null, or omitted for a parameterless
  function; `description` and `strict` also accept null. Reasoning supports `effort`
  (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`) and `summary`
  (`auto`, `concise`, `detailed`), subject to backend model support.
  `text.verbosity` supports `low`, `medium`, or `high`; Live's published settings
  do not expose `text.format`. Backend `instructions`, `maxOutputTokens`,
  `parallelToolCalls`, `serviceTier`, `reasoning`, `text`, and nested reasoning/text
  fields accept null. Null, false, empty strings, and empty arrays are preserved.
  The supported subset excludes MCP tool choice and service tiers other than those
  listed above; unsupported fields are rejected.
- `input`: up to 128 prior `{ type: 'message', role, content: [textPart] }` messages.
  User/developer roles use `{ type: 'input_text', text }`; assistant uses
  `{ type: 'output_text', text }` or `{ type: 'text', text }`.
- `store`: startup storage setting. `voice: { id }`: an authorized custom voice,
  mutually exclusive with the normalized string `sessionConfig.voice`.

Use `session-update` only for `providerOptions.openai.delegation.responses`
changes, typed with `Experimental_OpenAIRealtimeModelLiveUpdateOptions`. The backend
`model` is optional for updates; omitted settings retain their values and null is
preserved. `delegation.type` may be omitted in update options; the provider always
emits the required `type: 'responses'` on the wire. Startup settings and delegation
mode cannot be updated. Use `context-append` with plain-string `content`,
`providerOptions: { openai: { channel } }` (`instructions`, `thinking`, or
`commentary`), required `delegationId`
(`null` for session context), and optional `eventId`. Mute/unmute commands are
`input-audio-mute` and `input-audio-unmute`. Legacy voice-turn commands, including
`response-create`, buffer commit/clear, and conversation-item operations, throw.
Omitting the OpenAI channel selects `thinking` for silent factual context; the
shared runtime passes provider options through without interpreting the namespace.

For Responses delegation, register custom functions in
`providerOptions.openai.delegation.responses.tools`. Use these typed commands:

```ts
// Append every pending function result before explicitly continuing the backend.
model.serializeClientEvent({
  type: 'backend-tool-result',
  callId: 'call_123',
  output: JSON.stringify({ status: 'confirmed' }),
  eventId: 'result-1',
});
model.serializeClientEvent({
  type: 'backend-response-create',
  eventId: 'continue-1',
});

// Queue user text or images for a vision-capable backend, then request a response.
model.serializeClientEvent({
  type: 'backend-input-create',
  content: [
    { type: 'text', text: 'Read this order number.' },
    {
      type: 'image',
      url: 'https://example.com/order.png',
      providerOptions: { openai: { imageDetail: 'high' } },
    },
  ],
});
```

`backend-tool-result` and `backend-input-create` serialize to
`response.item.create`; `backend-response-create` serializes to `response.create`
with no backend configuration or delegation ID. Item creation has no standalone
success acknowledgment and does not automatically continue the backend. Continue
processing server errors and lifecycle events. These commands require Responses
delegation: the session binding must validate the mode before sending, using the
normalized `session-started.delegationMode` (`client` or `provider`). An omitted or
null session delegation resolves to the documented `client` default. The serializer
is stateless and cannot validate the current session mode; direct low-level misuse
may be rejected by the server. Client delegation uses `context-append` instead.

Normalized events include `audio-chunk`, `transcript-fragment` (speaker and
`startMs`/`endMs`, without fabricated turn IDs), `delegation-created`,
`backend-event` (the nested Responses event and outer delegation ID), and
`command-acknowledged` (provider-native command and optional `clientEventId`).
`delegation-created` also exposes optional `target` (`client` or `provider`),
`offsetMs`, and `responseId`. OpenAI's native `responses` target remains available
in `raw` and in the OpenAI provider options.
Every `response.event` yields an ordered array starting with `backend-event`.
Known nested lifecycle events additionally yield `backend-response-created` or
`backend-response-done` with the response ID and optional token usage (including
cached input tokens and raw usage). Completed function items yield `backend-tool-call`
only from `response.output_item.done`, never from an arguments-done event or the
empty `response.output` lifecycle snapshots. Each normalized event's `raw` retains
the full outer envelope and nested details.

The connection-local parser learns response IDs from nested `response.created`
events alongside the outer `delegation_id`. For a function item without a nested
`response_id`, it uses the sole active response associated with that delegation.
Interleaved delegations remain independent; ambiguous or unknown associations yield
only `backend-event`. Explicit response IDs are preserved and take precedence.
Null or omitted delegation IDs are documented as potentially uncorrelated, so those
granular events require an explicit response ID even when only one response is active.

Feed events in transport order. Terminal response events remove only their matching
response associations, and `session-started`/`session-closed` clear all state. Late
unidentified events after terminal cleanup remain raw; events after session close
cannot establish new associations until the next `session-started`. The parser stores
at most 512 active associations. Overflow emits `error` with code
`backend_correlation_limit` and disables inferred correlation until a new session;
pending entries are not silently evicted, and explicit response IDs still work.
Neither parser inspects empty lifecycle output arrays for pending tools. The runtime
must retain collected tool calls and submit every required result before continuing.

Usage in `session-usage` is cumulative: replace the previous snapshot, do not sum.
Send `session-close` and keep receiving until `session-closed` provides final
usage and reason before releasing the transport. A socket close alone is not
finalization. Every event preserves `raw`; unknown types become `custom`, and
malformed known events become `error` with code `invalid_server_event`.
Provider errors retain `clientEventId`; null error codes normalize to `undefined`
and remain available in `raw`.

See OpenAI's [Live session guide](https://developers.openai.com/api/docs/guides/live-conversations)
and [delegation guide](https://developers.openai.com/api/docs/guides/live-delegation).

Please check out the **[OpenAI provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/openai)** for more information.
