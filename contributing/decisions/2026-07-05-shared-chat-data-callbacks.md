---
status: proposed
date: 2026-07-05
decision-makers:
---

# Hook-level `onData` composes with a shared `Chat` instance

## Context and Problem Statement

`useChat` (and the other UI framework hooks) can either own the `Chat` instance
they create, or accept an existing one via the `chat` option so that multiple
components share the same conversation state:

```ts
const sharedChat = new Chat({ onData: chatLevelHandler });
useChat({ chat: sharedChat, onData: hookLevelHandler });
```

The event callbacks (`onData`, `onFinish`, `onError`, `onToolCall`,
`sendAutomaticallyWhen`) are `private` single-value fields on `AbstractChat`,
set once at construction. When a shared `chat` is supplied, `useChat` uses that
instance directly and never wires up the hook-level callbacks. As a result the
chat-level `onData` fired but the hook-level `onData` was silently dropped — the
bug reported in [#8597](https://github.com/vercel/ai/issues/8597).

Data parts are also transient in the common case (`transient: true`), so they
are never written to message state. A hook cannot recover them by subscribing to
messages; it needs a dedicated notification channel.

## Decision

Add a subscription channel for **data parts** to `AbstractChat` and have the
framework hooks register their `onData` on it when a shared `Chat` is supplied.

- `AbstractChat` keeps a `Set` of registered data callbacks and exposes
  `'~registerDataCallback'(cb)` (returning an unsubscribe function), mirroring
  the existing `'~registerMessagesCallback' | '~registerStatusCallback' |
'~registerErrorCallback'` pattern.
- When a data part is received during stream processing, the chat invokes the
  constructor `onData` **and** every registered callback. Hook-level callbacks
  therefore _supplement_ the chat-level one rather than overriding it.
- `useChat` registers its `onData` via `'~registerDataCallback'` in an effect,
  but only for the shared-`chat` case; a hook-owned chat already routes
  `onData` through the options passed to `new Chat`, so it must not double-fire.
- The `{ chat }` variant of `UseChatOptions` gains `onData` (via
  `Pick<ChatInit, 'onData'>`) so it can be passed without a type cast.

Scope is limited to `onData`. It fans out cleanly because it returns `void`.
`onToolCall` and `sendAutomaticallyWhen` return values that drive control flow
and cannot be multiplexed across subscribers, so they remain chat-owned;
`onFinish`/`onError` are left unchanged to keep this change focused on the
reported bug.

## Consequences

- Good, because the documented, intuitive behavior (hook `onData` fires) now
  works with shared chat instances.
- Good, because multiple hooks sharing one `Chat` each receive data parts, and
  each cleans up its subscription on unmount.
- Good, because it reuses the established `'~register*Callback'` convention
  rather than inventing a new mechanism.
- Neutral, because the fan-out is additive: the chat-level `onData` still fires,
  so existing single-owner usage is unaffected.
- Bad, because the event-callback surface is now asymmetric — only `onData` is
  subscribable while the others remain single-owner. This is documented above
  and can be revisited if the same need arises for the other callbacks.

## Alternatives Considered

- Overwrite the shared `Chat`'s `onData` with the hook's callback. Rejected
  because it clobbers the chat-level handler and breaks when multiple hooks
  share one instance.
- Make all event callbacks subscribable. Rejected as out of scope and because
  `onToolCall`/`sendAutomaticallyWhen` have return-value semantics that do not
  fan out.
- Store transient data parts in message state so hooks can observe them via the
  existing messages subscription. Rejected because transient parts are
  intentionally not persisted.
