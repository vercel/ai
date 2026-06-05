# agent-tui

Run AI SDK agents in a terminal UI.

`@lgrammel/agent-tui` provides a full-screen interface with streaming output,
tool cards, approvals, markdown rendering, scrollback, and a pinned prompt.

<img src="https://raw.githubusercontent.com/lgrammel/agent-tui/main/docs/assets/agent-tui-screenshot.png" alt="agent-tui terminal interface showing a weather agent tool call and response" width="100%" />

## Install

```bash
npm install @lgrammel/agent-tui ai
pnpm add @lgrammel/agent-tui ai
bun add @lgrammel/agent-tui ai
```

## Usage

```ts
import { openai } from "@ai-sdk/openai";
import { runAgentTUI } from "@lgrammel/agent-tui";
import { ToolLoopAgent, tool } from "ai";
import { z } from "zod";

await runAgentTUI({
  name: "Weather Agent",
  agent: new ToolLoopAgent({
    model: openai("gpt-5.4-mini"),
    instructions:
      "You are a concise weather assistant." +
      "Use the weather tool when the user asks about weather, " +
      "then answer in markdown.",
    tools: {
      weather: tool({
        description: "Get the weather in a location",
        inputSchema: z.object({ city: z.string() }),
        execute({ city }) {
          const weatherOptions = ["sunny", "cloudy", "rainy", "snowy", "windy"];
          const weather = weatherOptions[Math.floor(Math.random() * weatherOptions.length)];

          return { city, temperature: 72, weather };
        },
      }),
    },
    toolApproval: {
      weather: "user-approval",
    },
  }),
});
```

## Controls

- `Enter`: submit prompt
- `y` / `n`: approve or reject tool calls
- `Up` / `Down`: scroll transcript
- `PageUp` / `PageDown`: scroll transcript by a full page
- `Ctrl+L`: repaint
- `Esc` / `Ctrl+C`: exit

## API

```ts
await runAgentTUI({
  agent,
  name: "My Agent",
  tools: "collapsed",
  reasoning: "hidden",
  assistantResponseStats: "tokens",
});
```

Settings:

- `agent`: AI SDK agent to run.
- `name`: title shown in the terminal UI.
- `tools`: tool call rendering mode. Use `"full"` to show tool input and output, `"collapsed"` to show only tool cards, `"auto-collapsed"` to show the latest tool expanded until another part appears, or `"hidden"` to omit tool calls. Defaults to `"full"`.
- `reasoning`: reasoning rendering mode. Use `"full"` to show reasoning, `"collapsed"` to show only reasoning cards, `"auto-collapsed"` to show the latest reasoning expanded until another part appears, or `"hidden"` to omit reasoning. Defaults to `"full"`.
- `assistantResponseStats`: assistant response header statistic. Use `"tokensPerSecond"` to show throughput or `"tokens"` to show output token count. Defaults to `"tokensPerSecond"`.

## Example App

```bash
bun i
cp examples/basic/.env.example examples/basic/.env
bun run weather
```

Add `OPENAI_API_KEY` to `examples/basic/.env` before running the example.
