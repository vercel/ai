---
status: accepted
date: 2026-11-12
decision-makers: Gregor Martynus
---

# Keep tool error text unchanged in UI messages

## Context and Problem Statement

A failed tool call produces an error text in two places:

1. **The model.** In a multi-step `generateText` or `streamText` call, the SDK sends the model a tool result that contains `getErrorMessage(error)` from `@ai-sdk/provider` (`createToolModelOutput` with `errorMode: 'text'` in `packages/ai/src/prompt/create-tool-model-output.ts`). For an `Error`, this is `error.toString()`, for example `Error: weather backend timeout`. Invalid tool calls get a tool result with the same kind of text (`packages/ai/src/generate-text/stream-language-model-call.ts`).
2. **The UI message.** `toUIMessageStream` and `toUIMessageChunk` (`packages/ai/src/ui-message-stream/`) convert the failure into a `tool-output-error` or `tool-input-error` chunk. Its `errorText` becomes the `errorText` of the tool part in the UI message.

UI messages are the display state of a chat and also the source of the next request: `convertToModelMessages` (`packages/ai/src/ui/convert-to-model-messages.ts`) turns `errorText` back into the tool result that is sent to the model.

Since [#15994](https://github.com/vercel/ai/pull/15994) (June 2026), the default `onError` of the UI message stream returns `'An error occurred.'`, so that server error details do not leak to clients. The default also applied to failed tool calls. The two texts therefore differed by default, and the next request sent a tool result that the model had never received. This has two effects:

- **Requests are rejected.** Anthropic models with [preserved thinking](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking) (Claude Fable 5.1 and 5.2, Mythos 5.1 and 5.2, Opus 5.5, Sonnet 5.5, Haiku 5.5) bind each thinking block to the messages before it. A thinking block that the model produced after the failed tool call no longer matches the changed tool result, and the API responds with HTTP 400 "The block is bound to a different conversation". Every later request in that chat fails the same way. We reproduced this with `claude-sonnet-5-5` and `prefixMismatchBehavior: 'error'`: the second turn fails with the redacted text and succeeds with the model's text.
- **The model continues from an error that it never received.** In the same reproduction, with the invalid thinking dropped, the model told the user on the next turn that it had made up the error details.

[#24955](https://github.com/vercel/ai/pull/24955) added a warning and documentation for this case. The default still produced the failure.

For failed tool calls, the redaction also did not keep the text from the client. The model receives the full error text and can repeat it. In the reproduction, the tool part said "An error occurred." while the model's answer, which is sent to the same client, quoted the error.

Anthropic's guidance for preserved thinking is to [send the history back as the model received it](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking/change-tools-or-instructions), to shorten a tool result before it is first sent, and to use `prefix_mismatch_behavior: "drop_block"` only [while a change is being fixed](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking/fix-bound-to-a-different-conversation).

How should the SDK treat the error text of failed tool calls in UI messages?

## Decision Drivers

- The default configuration must not produce a message history that a model rejects.
- UI messages that are converted with `convertToModelMessages` should reproduce what the model received.
- `packages/ai` contains no provider-specific code, and the behavior should not depend on the model.
- What a client receives must be controllable by the application, and a change to it must be explicit and documented.
- Applications that already pass `onError` have chosen their error handling and should keep it.

## Considered Options

1. Keep the model's error text in UI messages by default, with an opt-out
2. Keep redacting and send Anthropic `prefix_mismatch_behavior: "drop_block"` by default
3. Keep redacting and remove the reasoning that follows a redacted tool error
4. Redact by default only for models that do not bind reasoning to earlier messages
5. Keep redacting the displayed text and carry the model's text separately in the UI message
6. Keep redacting, with documentation and a warning only (the state after #24955)

## Decision Outcome

Chosen option: "Keep the model's error text in UI messages by default, with an opt-out", because it is the only option that makes the default message history exact for every provider, platform, and thinking mode, without provider-specific code and without losing reasoning.

The decision in detail:

- For a failed tool call that is not provider-executed, the `errorText` of the `tool-output-error` chunk (tool execution error) or `tool-input-error` chunk (invalid tool call) is `getErrorMessage(error)`, the text that the model receives.
- `UIMessageStreamOptions` and `ToUIMessageChunkOptions` get the option `redactToolErrors?: boolean`. When it is `true`, `errorText` is the result of `onError`, which returns `'An error occurred.'` by default.
- `redactToolErrors` defaults to `true` when `onError` is provided, and to `false` otherwise. An existing `onError` therefore keeps handling failed tool calls. `redactToolErrors: false` limits a provided `onError` to stream errors.
- Stream errors (`error` chunks) never reach the model. They keep going through `onError` and stay masked by default.
- Tool execution errors with `providerExecuted: true` are unchanged: they bypass `onError`. Invalid tool calls of provider-executed tools are unchanged as well: they always use `onError`, because the SDK does not send the model a tool result for them.
- When `getErrorMessage` cannot serialize the error, the model did not receive an error text either. `errorText` is then the result of `onError`.
- The `error` of a `tool-error` stream part is the error that the model received. A package that sends the model a different error than the one it reports to the application puts the model's error into the stream part. `@ai-sdk/harness` does this for a failed tool context validation of a host tool: the runtime receives a fixed message, the stream part carries an error with that message, and the detailed validation error, which includes the context value, stays in host-only callbacks such as `onToolExecutionEnd`.
- Redaction belongs before the model receives the error. An application that must keep details away from the model and the client catches the error in the tool's `execute` function and throws an error with a safe message.

Non-goals:

- No change to the text that the model receives.
- No new hook that maps a tool error before the model receives it.
- No default `drop_block` and no other provider-specific recovery.
- No repair of chats that were stored with a redacted error text.
- No change to `@ai-sdk/workflow`, which builds its UI chunks in `packages/workflow/src/to-ui-message-chunk.ts`.

### Consequences

- Good, because a UI message that is converted back reproduces the tool result that the model received, so the default no longer causes rejected requests on models with preserved thinking.
- Good, because the model reads the same error on later turns as the one it reacted to, on every provider.
- Good, because it needs no provider-specific logic, no beta header, and works with every thinking mode.
- Bad, because clients receive the error text of failed tool calls by default again: `error.toString()` of an error thrown by `execute`, and the validation details of an invalid tool call. Applications that relied on the masking since #15994 must set `redactToolErrors: true` or throw safe errors from their tools. The changeset and the documentation state this.
- Bad, because the default of `redactToolErrors` depends on whether `onError` is provided. AI SDK 8 should make the default `false` in both cases.
- Neutral, because applications that pass `onError` keep the behavior they have today, including a possible mismatch. The warning from #24955 still reports it.
- Neutral, because chats that were stored with a redacted error text keep failing on models with preserved thinking until the reasoning parts after the failed tool call are removed, or until the request sends `drop_block`.

## Implementation Plan

- **Affected paths**:
  - `packages/ai/src/ui-message-stream/to-ui-message-chunk.ts`: resolve `redactToolErrors`, and use the model's text for `tool-error` parts and invalid `tool-call` parts unless tool errors are redacted
  - `packages/ai/src/ui-message-stream/get-model-tool-error-text.ts`: new, the one helper that returns the text the model receives, or `undefined` when the error cannot be serialized
  - `packages/ai/src/ui-message-stream/to-ui-message-stream.ts`: pass `onError` and `redactToolErrors` through without a default, and use the helper for the mismatch warning
  - `packages/ai/src/generate-text/stream-text-result.ts`: add `redactToolErrors` to `UIMessageStreamOptions`
  - `packages/ai/src/generate-text/stream-text.ts` and `packages/harness/src/agent/internal/harness-stream-text-result.ts`: forward `redactToolErrors` in `toUIMessageStream`, `pipeUIMessageStreamToResponse`, and `toUIMessageStreamResponse`
  - `packages/harness/src/agent/internal/run-prompt.ts`: a failed tool context validation of a host tool puts an error with the message that the runtime received into the `tool-error` stream part (`HostToolOutcome.streamError`)
  - `content/docs/04-ai-sdk-ui/03-chatbot-tool-usage.mdx`, `content/docs/04-ai-sdk-ui/02-chatbot.mdx`, `content/docs/09-troubleshooting/12-use-chat-an-error-occurred.mdx`, `content/providers/01-ai-sdk-providers/05-anthropic.mdx`, `content/docs/07-reference/01-ai-sdk-core/02-stream-text.mdx`, `content/docs/07-reference/02-ai-sdk-ui/50-direct-chat-transport.mdx`: describe the default, the option, and how to throw safe errors from a tool
- **Dependencies**: none
- **Patterns to follow**:
  - The provider-executed branch of the `tool-error` case in `to-ui-message-chunk.ts`, which already bypasses `onError` so that the error survives a round trip
  - Options that are forwarded by spreading (`createAgentUIStream`, `DirectChatTransport`) need no change; methods that destructure `UIMessageStreamOptions` must name `redactToolErrors`, or it ends up in the response init
  - Warning tests set `globalThis.AI_SDK_LOG_WARNINGS`, as in `to-ui-message-stream.test.ts`
  - One comment at `getToolErrorText` in `to-ui-message-chunk.ts` explains why the text is not altered and links this ADR
- **Patterns to avoid**:
  - Do not call `onError` for a failed tool call unless tool errors are redacted
  - Do not add a model or provider check to `packages/ai/src/ui-message-stream/`
  - Do not compute the model's error text in a second place; use `getModelToolErrorText`
  - Do not change `createToolModelOutput` or the text that the model receives
  - Do not put an error into a `tool-error` stream part that has details the model did not receive
- **Configuration**: the `redactToolErrors` option; no environment variables or feature flags
- **Migration steps**: an application that wants the previous default sets `redactToolErrors: true`. #15994 was backported to `release-v6.0` and `release-v5.0`, so the same change applies to those branches in separate pull requests.

### Verification

- [x] `toUIMessageChunk` returns `errorText: 'Error: tool failed'` for a `tool-error` part and for an invalid `tool-call` part with `new Error('tool failed')` when no options are set
- [x] `toUIMessageChunk` returns `errorText: 'An error occurred.'` for both parts with `{ redactToolErrors: true }`
- [x] `toUIMessageChunk` returns the `onError` result for both parts when only `onError` is set, and the model's text with `{ onError, redactToolErrors: false }`
- [x] `toUIMessageChunk({ type: 'error', error })` returns `errorText: 'An error occurred.'` when no options are set
- [x] A UI message that `readUIMessageStream` builds from `toUIMessageStream` output converts back with `convertToModelMessages` to the output of `createToolModelOutput({ errorMode: 'text' })`, for a tool execution error and for an invalid tool call
- [x] `toUIMessageStream` logs the mismatch warning with `{ redactToolErrors: true }` and logs nothing with the default options, for a tool error that is followed by reasoning from a later step
- [x] In `@ai-sdk/harness`, a host tool whose context validation fails produces a `tool-error` stream part with the message `Tool context validation failed.`, and neither the stream parts nor the UI chunks contain the context value. This holds when the turn pauses for host input before the runtime echoes the result, and when the tool runs after an approval.
- [x] `grep -rn "@ai-sdk/anthropic" packages/ai/src` returns no results
- [x] `pnpm test` passes in `packages/ai` and `packages/harness`
- [x] A two-turn chat with a failing tool, adaptive thinking, and `prefixMismatchBehavior: 'error'` on a model with preserved thinking succeeds on the second turn with the default options, and fails with HTTP 400 with `redactToolErrors: true`

## Pros and Cons of the Options

### Keep the model's error text in UI messages by default, with an opt-out

The UI message stores `getErrorMessage(error)` for a failed tool call. `redactToolErrors` restores the replacement through `onError`.

- Good, because the stored history equals what the model received, which is what Anthropic recommends for preserved thinking
- Good, because it works for every provider, platform, and thinking mode, and needs no beta header
- Good, because it is the behavior that tool errors had before #15994, limited to tool errors
- Neutral, because an explicit `onError` keeps redacting tool errors, so those applications keep the mismatch until they set `redactToolErrors: false`
- Bad, because the client receives the error text of failed tool calls by default

### Keep redacting and send Anthropic `prefix_mismatch_behavior: "drop_block"` by default

The Anthropic provider asks the API to drop thinking blocks that no longer match.

- Good, because clients keep receiving the redacted text
- Good, because it also covers chats that are already stored and other causes of a changed history
- Bad, because the API rejects the setting when thinking is `disabled` or `between_tools`, so it cannot be a default for every request
- Bad, because it needs the `thinking-binding-controls-2026-08-01` beta header on every request
- Bad, because the model loses its reasoning and reads an error that it never received, and Anthropic documents the setting as a temporary measure

### Keep redacting and remove the reasoning that follows a redacted tool error

This is the procedure that Anthropic documents for a tool result that must be redacted after the fact.

- Good, because it is valid on every platform and with every thinking mode
- Bad, because `packages/ai` cannot know which providers need it, so the reasoning would be removed for every provider
- Bad, because the model loses its reasoning and reads an error that it never received

### Redact by default only for models that do not bind reasoning to earlier messages

The default of the redaction depends on a capability of the model.

- Good, because clients of other models keep receiving the redacted text
- Bad, because `toUIMessageStream` does not know the model, so it needs a new signal from every provider that can serve an affected model
- Bad, because what a client receives changes when an application switches the model id
- Bad, because the mismatch stays in place for all other models

### Keep redacting the displayed text and carry the model's text separately in the UI message

The UI part gets a second field with the model's text, in plain text or encrypted with a server secret.

- Good, because the displayed text and the replayed text can differ
- Bad, because a plain field sends the text to the client anyway
- Bad, because an encrypted field needs key management in the SDK, and rotating the key recreates the mismatch

### Keep redacting, with documentation and a warning only

The state after #24955.

- Good, because nothing changes for existing applications
- Bad, because the default configuration keeps producing chats that fail permanently on models with preserved thinking

## More Information

- [#15994](https://github.com/vercel/ai/pull/15994) introduced the redaction. [#24955](https://github.com/vercel/ai/pull/24955) added the warning and the first documentation.
- Anthropic documentation: [Preserved thinking](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking), [Prefix checks on thinking blocks](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking/prefix-checks), [Change tools or instructions without failing the prefix check](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking/change-tools-or-instructions)
- Follow-ups:
  - Apply the change to `release-v6.0` and `release-v5.0`
  - Align the tool error text in `packages/workflow/src/to-ui-message-chunk.ts` with the text that the model receives
  - AI SDK 8: make `redactToolErrors` default to `false` when `onError` is provided
- Revisit this decision if applications need a central place to redact tool errors before the model receives them. That would be a new hook and a new ADR.
- Code reference: `packages/ai/src/ui-message-stream/to-ui-message-chunk.ts` has an `ADR:` comment at `getToolErrorText`.
