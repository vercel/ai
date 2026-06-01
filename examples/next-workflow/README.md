# AI SDK - WorkflowAgent Chat Example

This example demonstrates using the AI SDK's `WorkflowAgent` with the Workflow DevKit to build a durable, resumable chat agent with tool calling.

## Features

- **Durable Agent**: Uses `WorkflowAgent` from `@ai-sdk/workflow` for fault-tolerant AI agent execution
- **Tool Calling**: Includes weather lookup and calculator tools implemented as durable steps
- **Streaming**: Real-time streaming responses via `getWritable()` and `createUIMessageStreamResponse`
- **Resumable**: Workflow runs survive restarts and can be reconnected
- **Telemetry E2E Harness**: Visit `/telemetry` to run deterministic WorkflowAgent telemetry scenarios for lifecycle events, tool execution, context filtering, approvals, errors, and reconnects

## Running

1. Install dependencies: `pnpm install`
2. Start the dev server: `pnpm dev`
3. Open http://localhost:3000

## Telemetry

Open http://localhost:3000/telemetry to run deterministic WorkflowAgent telemetry scenarios. The harness records stable AI SDK telemetry integration events for lifecycle callbacks, model calls, chunks, tool execution, context filtering, approval resume, error handling, and reconnect behavior.
