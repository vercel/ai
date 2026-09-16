---
title: Confident AI
description: Trace and monitor your AI SDK applications with Confident AI
---

# Confident AI Observability

[Confident AI](https://confident-ai.com/) is an LLM observability and evaluation platform for teams building reliable AI applications in development and production.

[`confident-trace`](https://github.com/confident-ai/confident-trace), Confident AI's OpenTelemetry-native tracing SDK, traces AI SDK applications without changing your calls — every `generateText` and `streamText` call shows up in the [Observatory](https://www.confident-ai.com/docs/llm-tracing/introduction) as a trace with agent, step, model, and tool spans, so you can see which tools your app chose, what each model call cost, and run evaluations on the result.

Confident AI integrates with the AI SDK to provide:

- [Traces](https://www.confident-ai.com/docs/llm-tracing/introduction) with the full agent, step, model, and tool hierarchy
- [Token usage and cost](https://www.confident-ai.com/docs/llm-tracing/features/token-usage-cost) on every model call
- [Threads](https://www.confident-ai.com/docs/llm-tracing/features/threads) that group a conversation's turns into one unit
- [Online evaluations](https://www.confident-ai.com/docs/llm-tracing/online-evals) that score traces as they are ingested

## Setup

Tracing requires Node.js 22 or later and AI SDK `>=7.0.93 <8`.

### 1. Install confident-trace

```bash
npm install confident-trace @ai-sdk/otel
```

### 2. Set Your API Key

Sign up or log in to [Confident AI](https://app.confident-ai.com) to get your project API key, then set it as an environment variable:

```bash filename=".env"
CONFIDENT_API_KEY="YOUR-PROJECT-API-KEY"
```

<Note>
  For users in the EU region set
  `CONFIDENT_OTEL_ENDPOINT="https://eu.otel.confident-ai.com/v1/traces"`
</Note>

### 3. Register the Telemetry Integration

The `createVercelAITracer()` function returns a tracer that maps AI SDK spans onto
Confident AI's span types. Pass it to `OpenTelemetry` and register that once at
application startup, before any AI SDK call. `init()` sets up the exporter that
ships the spans to your project:

```ts filename="instrumentation.ts"
import { registerTelemetry } from 'ai';
import { OpenTelemetry } from '@ai-sdk/otel';
import { init } from 'confident-trace';
import { createVercelAITracer } from 'confident-trace/vercel-ai';

export function register() {
  init();
  registerTelemetry(new OpenTelemetry({ tracer: createVercelAITracer() }));
}
```

In Next.js, put this in `instrumentation.ts` at your project root — Next.js calls
`register()` for you. For Node.js applications without Next.js, run the same two
lines at the top level of your entry file:

```ts filename="index.ts"
import { generateText, registerTelemetry } from 'ai';
import { openai } from '@ai-sdk/openai';
import { OpenTelemetry } from '@ai-sdk/otel';
import { init } from 'confident-trace';
import { createVercelAITracer } from 'confident-trace/vercel-ai';

const runtime = init();
registerTelemetry(new OpenTelemetry({ tracer: createVercelAITracer() }));

try {
  const { text } = await generateText({
    model: openai('gpt-4o'),
    prompt: 'How do you make the best coffee?',
  });
  console.log(text);
} finally {
  await runtime.shutdown();
}
```

Your AI SDK calls stay exactly as they are. Every span carries the `Vercel AI SDK` integration label, nests under whatever span is active when the call is made, and captures:

- **Agent and step spans** — one span for the overall `generateText` or `streamText` call, plus one span per step in a multi-step run.
- **Model calls** — [LLM spans](https://www.confident-ai.com/docs/llm-tracing/features/span-types#llm-spans) with the model name, [token usage](https://www.confident-ai.com/docs/llm-tracing/features/token-usage-cost), finish reason, and normalized input/output messages, including the tool calls the model requested.
- **Tool calls** — [tool spans](https://www.confident-ai.com/docs/llm-tracing/features/span-types#tool-spans) with the tool name, its input, and its result, nested under the step that ran them.
- **Content** — prompt and response text, captured by default with no size limit unless you configure one, and subject to the [content policy](https://www.confident-ai.com/docs/llm-tracing/features/masking).

<Note>
  Reasoning and binary content parts are marked but not exported, and raw
  request headers, arbitrary SDK metadata, and exception messages are left out.
  Embeddings, reranking, and the image and audio APIs are outside this
  integration's scope.
</Note>

<Note>
  Initialize once, shut down once. In a long-running server, call `init()` at
  startup and `runtime.shutdown()` during graceful shutdown, after in-flight
  requests and streams finish — never per request. In a serverless function,
  call `runtime.flush()` at the end of the handler instead, once any stream has
  finished, so spans are exported before the function freezes.
</Note>

## Advanced Features

### Online Evals

You can configure what happens to your incoming traces on Confident AI's [workflows page](https://www.confident-ai.com/docs/llm-tracing/workflows).

![Confident AI workflows page](https://confident-docs.s3.us-east-1.amazonaws.com/confident-trace-workflows.png)

Here's the workflows you can configure:

- **Evaluation rules** — evaluate incoming traces against a [metric collection](https://www.confident-ai.com/docs/metrics/metric-collections).
- **Classifiers** — label your traces by issue, sentiment, or any dimension you define, which lets you group or filter them later on.
- **Queue ingestion** — route your production traces into annotation queues for your internal review team to annotate them by hand.
- **Dataset ingestion** — ingest your production traces into datasets to reuse as test cases and iterate on results to improve over time.

You can create custom workflows for different data models like traces, spans, and threads individually as per your needs.

To evaluate a component or trace manually, pass a metric collection via `updateTrace` — see [online evaluations](https://www.confident-ai.com/docs/llm-tracing/online-evals).

### Trace Properties

Use a [trace context](https://www.confident-ai.com/docs/llm-tracing/features/trace-context) to attach attributes you know before the call starts. It creates no extra span — the trace started by `generateText()` inherits everything you pass:

```ts
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { traceContext } from 'confident-trace';

const { text } = await traceContext(
  {
    tags: ['support'],
    metadata: { release: '2026-09' },
    userId: 'user-456',
    environment: 'production',
  },
  () =>
    generateText({
      model: openai('gpt-4o'),
      prompt: 'How do you make the best coffee?',
    }),
);
```

### Group Traces Into Threads

`confident-trace` provides a `turn()` method you can use to group two sequential AI SDK calls into one turn. Reuse the same thread ID on later turns to group them into one thread you can view and evaluate on Confident AI:

```ts
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { turn, updateTrace } from 'confident-trace';

async function chat(prompt: string, threadId: string) {
  return turn({ name: 'chat', threadId }, async () => {
    const { text } = await generateText({
      model: openai('gpt-4o'),
      prompt,
    });
    updateTrace({ input: prompt, output: text });
    return text;
  });
}
```

## Troubleshooting

- **No traces at all:** confirm `registerTelemetry()` runs before the first AI SDK call. In Next.js, that means `instrumentation.ts` at the project root, not inside a route. Registering no telemetry integration disables AI SDK telemetry entirely.
- **Traces stop partway through a run:** the process exited before the export queue drained. Call `runtime.shutdown()` at exit, or `runtime.flush()` at the end of a serverless handler.
- **Streamed calls arrive incomplete:** finish consuming or abort the stream before flushing or shutting down.
- **Traces are missing content:** check AI SDK's `recordInputs` and `recordOutputs`, and `captureContent` on `init()`.

For anything else, see [Confident AI's troubleshooting guide](https://www.confident-ai.com/docs/llm-tracing/troubleshooting).

## Learn More

- [AI observability on Confident AI](https://www.confident-ai.com/docs/llm-tracing/introduction)
- [The full AI SDK integration guide](https://www.confident-ai.com/docs/integrations/third-party/vercel-ai-sdk)
- [Online evaluations](https://www.confident-ai.com/docs/llm-tracing/online-evals)
- [Need help integrating? Talk to a human.](https://www.confident-ai.com/book-a-demo)
- [AI SDK Telemetry documentation](/docs/ai-sdk-core/telemetry)
