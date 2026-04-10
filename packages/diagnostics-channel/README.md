# @ai-sdk/diagnostics-channel

A [TelemetryIntegration](https://ai-sdk.dev/docs) for the [AI SDK](https://ai-sdk.dev) that publishes lifecycle events to [Node.js diagnostics channels](https://nodejs.org/api/diagnostics_channel.html).

APM vendors (Datadog, New Relic, etc.) can subscribe to well-known channel names to instrument AI SDK operations without coupling to the SDK's callback system.

## Installation

```bash
npm install @ai-sdk/diagnostics-channel
```

## Usage

```ts
import { registerTelemetryIntegration } from 'ai';
import { createDiagnosticsChannelIntegration } from '@ai-sdk/diagnostics-channel';

registerTelemetryIntegration(createDiagnosticsChannelIntegration());
```

### Subscribing to events

```ts
import diagnostics_channel from 'node:diagnostics_channel';

diagnostics_channel.subscribe('ai-sdk:operation:start', (message, name) => {
  console.log(`Operation started:`, message);
});

diagnostics_channel.subscribe('ai-sdk:operation:finish', (message, name) => {
  console.log(`Operation finished:`, message);
});
```

## Channel Names

| Channel | Description |
| --- | --- |
| `ai-sdk:operation:start` | Fired when any operation begins (generateText, streamText, generateObject, streamObject, embed, embedMany, rerank) |
| `ai-sdk:step:start` | Fired when an individual LLM invocation step begins |
| `ai-sdk:tool-call:start` | Fired when a tool execution begins |
| `ai-sdk:tool-call:finish` | Fired when a tool execution completes |
| `ai-sdk:chunk` | Fired for each chunk during streaming (streamText only) |
| `ai-sdk:step:finish` | Fired when an individual LLM invocation step completes |
| `ai-sdk:embed:start` | Fired when an individual embedding model call begins |
| `ai-sdk:embed:finish` | Fired when an individual embedding model call completes |
| `ai-sdk:rerank:start` | Fired when an individual reranking model call begins |
| `ai-sdk:rerank:finish` | Fired when an individual reranking model call completes |
| `ai-sdk:object-step:start` | Fired when an object generation step begins |
| `ai-sdk:object-step:finish` | Fired when an object generation step completes |
| `ai-sdk:operation:finish` | Fired when any operation completes |
| `ai-sdk:error` | Fired when an unrecoverable error occurs |

All channel names are exported as `AI_SDK_CHANNEL_NAMES` for programmatic access.

## Runtime Compatibility

This integration requires Node.js >= 15.1.0 (diagnostics channels are stable since Node.js 19.2.0). It is **not compatible** with non-Node.js runtimes (edge, browser) as it depends on the `node:diagnostics_channel` built-in module.

## Documentation

For more information, see the [AI SDK documentation](https://ai-sdk.dev/docs).
