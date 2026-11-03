# AI SDK - DevTools

A local development tool for debugging and inspecting AI SDK applications. View LLM requests, responses, tool calls, and multi-step interactions in a web-based UI.

> **Note**: This package is experimental and intended for local development only. Do not use in production environments.

## Setup

```bash
npm i ai @ai-sdk/devtools
```

## Usage

```typescript
import { registerTelemetry } from 'ai';
import { DevToolsTelemetry } from '@ai-sdk/devtools';

registerTelemetry(DevToolsTelemetry());
```

See the [DevTools documentation](https://ai-sdk.dev/docs/ai-sdk-core/devtools) for more information.
