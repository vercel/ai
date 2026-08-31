# AI SDK - WorkflowAgent Chat Example

This example demonstrates using the AI SDK's `WorkflowAgent` with the Workflow DevKit to build a durable, resumable chat agent with tool calling.

## Features

- **Durable Agent**: Uses `WorkflowAgent` from `@ai-sdk/workflow` for fault-tolerant AI agent execution
- **Tool Calling**: Includes weather lookup and calculator tools implemented as durable steps
- **`toModelOutput`**: The `getWeather` tool sends the model a compact one-line summary while the UI keeps the full structured result
- **Streaming**: Real-time streaming responses via `getWritable()` and `createUIMessageStreamResponse`
- **Resumable**: Workflow runs survive restarts and can be reconnected
- **Telemetry E2E Harness**: Visit `/telemetry` to run deterministic WorkflowAgent telemetry scenarios for lifecycle events, tool execution, context filtering, approvals, errors, and reconnects
- **Sandbox E2E Harness**: Visit `/sandbox` to run a deterministic WorkflowAgent sandbox tool execution scenario
- **Async Video Workflow**: Visit `/async-apis` to find recent repository maintainers and turn their GitHub avatars into short FAL videos while workflow progress streams to the browser

## Testing `toModelOutput`

`WorkflowAgent` honors a tool's optional `toModelOutput` hook, just like `generateText`, `streamText`, and `ToolLoopAgent`. The hook controls what the model sees for a tool result, independent of what the app/UI receives.

The `getWeather` tool in `workflow/agent-chat.ts` demonstrates this:

1. Run the app and ask: **"What's the weather in Boston?"**
2. In the browser, the rendered tool result shows the full JSON object (`{ city, temperature, unit, condition }`) from the raw `execute` return.
3. In the dev server terminal, the `onEnd` callback logs the model-facing tool result, for example:

   ```json
   {
     "type": "tool-result",
     "toolName": "getWeather",
     "output": { "type": "text", "value": "Boston: 22°C, sunny." }
   }
   ```

The `calculate` tool has no `toModelOutput`, so its model-facing output stays the default `json` serialization for comparison.

## Running

1. Install dependencies: `pnpm install`
2. Create `.env.local` and add the API keys needed by the page you want to run:

   ```bash
   ANTHROPIC_API_KEY=...
   FAL_API_KEY=...
   GITHUB_TOKEN=...
   ```

   `GITHUB_TOKEN` needs read access to the repository submitted on the async
   APIs page. Public-repository access is enough for public repositories.

3. Start the dev server: `pnpm dev`
4. Open http://localhost:3000

## Telemetry

Open http://localhost:3000/telemetry to run deterministic WorkflowAgent telemetry scenarios. The harness records stable AI SDK telemetry integration events for lifecycle callbacks, model calls, chunks, tool execution, context filtering, approval resume, error handling, and reconnect behavior.

## Sandbox

Open http://localhost:3000/sandbox to run a deterministic WorkflowAgent `experimental_sandbox` scenario. The harness verifies that the sandbox session provided to `agent.stream` is available during tool execution.

## Async APIs

Open http://localhost:3000/async-apis and submit a GitHub repository URL. The
workflow queries merged pull requests from the last 30 days, ranks the human
users who merged them, downloads the top three avatars, and generates a
five-second image-to-video clip for each maintainer with FAL's
`luma-dream-machine/ray-2/image-to-video` model.

The workflow passes the new `webhook` option to `experimental_generateVideo`.
It uses Workflow DevKit's `createWebhook()` to give FAL a durable callback URL.
The workflow suspends until FAL calls that URL, then checks the completed job
and streams the result to the page without polling.

FAL cannot call a webhook on a private loopback address. When this example runs
on plain `localhost`, it automatically uses the same async start/status API with
durable polling instead. Deploy it to Vercel, or set `WORKFLOW_LOCAL_BASE_URL`
to a public HTTPS URL that forwards to the local server, to exercise the webhook
path locally.
