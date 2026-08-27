---
title: Error Handling
description: Learn how to handle errors in the AI SDK Core
---

# Error Handling

## Handling regular errors

Regular errors are thrown and can be handled using the `try/catch` block.

```ts highlight="4,9-11"
import { generateText } from 'ai';
__PROVIDER_IMPORT__;

try {
  const { text } = await generateText({
    model: __MODEL__,
    prompt: 'Write a vegetarian lasagna recipe for 4 people.',
  });
} catch (error) {
  // handle error
}
```

See [Error Types](/docs/reference/ai-sdk-errors) for more information on the different types of errors that may be thrown.

## Handling streaming errors (simple streams)

When errors occur during streams that do not support error chunks,
the error is thrown as a regular error.
You can handle these errors using the `try/catch` block.

```ts highlight="4,13-15"
import { streamText } from 'ai';
__PROVIDER_IMPORT__;

try {
  const { textStream } = streamText({
    model: __MODEL__,
    prompt: 'Write a vegetarian lasagna recipe for 4 people.',
  });

  for await (const textPart of textStream) {
    process.stdout.write(textPart);
  }
} catch (error) {
  // handle error
}
```

## Handling streaming errors (streaming with `error` support)

The `stream` result supports error parts.
You can handle those parts similar to other parts.
It is recommended to also add a try-catch block for errors that
happen outside of the streaming.

```ts highlight="14-22"
import { StreamProviderError, streamText } from 'ai';
__PROVIDER_IMPORT__;

try {
  const { stream } = streamText({
    model: __MODEL__,
    prompt: 'Write a vegetarian lasagna recipe for 4 people.',
  });

  for await (const part of stream) {
    switch (part.type) {
      // ... handle other part types

      case 'error': {
        const error = part.error;

        if (StreamProviderError.isInstance(error)) {
          console.error(error.message, {
            type: error.type,
            code: error.code,
            statusCode: error.statusCode,
            isRetryable: error.isRetryable,
          });
        }
        break;
      }

      case 'abort': {
        // handle stream abort
        break;
      }

      case 'tool-error': {
        const error = part.error;
        // handle error
        break;
      }
    }
  }
} catch (error) {
  // handle error
}
```

## Retrying provider errors after streaming starts

`maxRetries` retries failures that happen while starting a model call. To retry
well-formed provider error events received after response streaming has begun,
set `streamRetries`:

```ts highlight="7"
import { streamText } from 'ai';
__PROVIDER_IMPORT__;

const { textStream } = streamText({
  model: __MODEL__,
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
  streamRetries: 2,
});

for await (const textPart of textStream) {
  process.stdout.write(textPart);
}
```

Stream retries rerun only the failed model step with the same accumulated
conversation and generation context. Earlier completed steps, including their
tool calls and tool results, are not replayed. Tool input, tool calls, approval
requests, tool callbacks, and client-side tool execution from a failed attempt
are discarded. They are only exposed or executed after an attempt reaches a
successful model-call finish.

Well-formed provider error events are normalized into
[`StreamProviderError`](/docs/reference/ai-sdk-errors/ai-stream-provider-error)
instances. The same instance is supplied to `onError` and, if recovery is not
requested or retries are exhausted, to the `error` part in the full stream. Use
its `isRetryable` metadata when deciding whether to request recovery.

A retry remains part of the same logical step. `onStepStart` runs once for that
step. `onLanguageModelCallStart` runs for each provider call attempt, while
`onLanguageModelCallEnd` runs only for attempts that reach a model-call finish.

You can also decide dynamically in `onError`. Set `streamRetries` explicitly to
enable stream recovery; use `0` when a single retry should only be
callback-directed:

```ts highlight="7-12"
const result = streamText({
  model: __MODEL__,
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
  streamRetries: 0,
  onError: ({ error }) => {
    if (isTransientProviderError(error)) {
      return { retry: true };
    }
  },
});
```

Callback-directed recovery is limited to one retry per logical step. When
automatic retries are configured, `onError` can request one additional retry
after the automatic retry budget is exhausted. This bounds the total number of
recovery calls for a step to `streamRetries + 1`.

When `streamRetries` is omitted, all stream retry behavior is disabled and an
existing logging-only `onError` callback retains incremental tool streaming.
An `onError` return value other than `{ retry: true }` keeps its previous
behavior and does not request recovery. Provider error events that are
recovered are not emitted as final `error` parts.

<Note type="warning">
  Non-tool output emitted before a provider error cannot be retracted. A retried
  model step may therefore append repeated or divergent partial text, reasoning,
  files, or sources to consumer streams. Open text and reasoning parts are ended
  before recovered output begins so UI consumers do not retain them in a
  streaming state. Failed-attempt output is excluded from the recovered step
  result, structured output parsing, response messages, and subsequent model
  steps. Final request and response metadata come from the recovered attempt.
  Retries also add latency and may incur additional provider usage and cost.
</Note>

<Note type="warning">
  Failed-attempt isolation prevents AI SDK client-side tools from executing, but
  it cannot undo work already performed by provider-executed tools. Retrying a
  step after provider-side work may repeat that work or its cost. Use
  idempotency controls for provider-executed side effects.
</Note>

## Handling stream aborts

When streams are aborted (e.g., via chat stop button), you may want to perform cleanup operations like updating stored messages in your UI. Use the `onAbort` callback to handle these cases.

The `onAbort` callback is called when a stream is aborted via `AbortSignal`, but `onEnd` is not called. This ensures you can still update your UI state appropriately.

```ts highlight="6-10"
import { streamText } from 'ai';
__PROVIDER_IMPORT__;

const { textStream } = streamText({
  model: __MODEL__,
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
  onAbort: ({ steps }) => {
    // Update stored messages or perform cleanup
    console.log('Stream aborted after', steps.length, 'steps');
  },
  onEnd: ({ steps, totalUsage }) => {
    // This is called on normal completion
    console.log('Stream completed normally');
  },
});

for await (const textPart of textStream) {
  process.stdout.write(textPart);
}
```

The `onAbort` callback receives:

- `steps`: An array of all completed steps before the abort

You can also handle abort events directly in the stream:

```ts highlight="11-14"
import { streamText } from 'ai';
__PROVIDER_IMPORT__;

const { stream } = streamText({
  model: __MODEL__,
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});

for await (const chunk of stream) {
  switch (chunk.type) {
    case 'abort': {
      // Handle abort directly in stream
      console.log('Stream was aborted');
      break;
    }
    // ... handle other part types
  }
}
```
