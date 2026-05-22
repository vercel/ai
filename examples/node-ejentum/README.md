# Ejentum Reasoning Harness + AI SDK

[`ejentum-ai`](https://www.npmjs.com/package/ejentum-ai) wraps the [Ejentum](https://ejentum.com) Reasoning Harness as four AI SDK tool definitions (`harness_reasoning`, `harness_code`, `harness_anti_deception`, `harness_memory`) the model calls before generating. Each call returns a structured cognitive scaffold (named failure pattern, executable procedure, suppression vectors, falsification test) the model reads internally to harden its next response.

This example demonstrates three usage patterns: `generateText` with reasoning, `generateText` with anti-deception under sunk-cost pressure, and `streamText`.

## Setup

1. Create a `.env` file with the following:

```sh
OPENAI_API_KEY="YOUR_OPENAI_API_KEY"
EJENTUM_API_KEY="YOUR_EJENTUM_API_KEY"
```

Get an Ejentum API key (free and paid tiers) at https://ejentum.com/pricing.

2. From the root directory of the AI SDK repo:

```sh
pnpm install
pnpm build
```

## Run

From this directory (`examples/node-ejentum`):

```sh
pnpm harness:reasoning         # diagnostic query, harness_reasoning fires
pnpm harness:anti-deception    # sunk-cost prompt, harness_anti_deception fires
pnpm harness:streaming         # streamText with code-mode harness
```

## What it does

```ts
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createEjentumTools } from "ejentum-ai";

const { text } = await generateText({
  model: openai("gpt-4o"),
  tools: createEjentumTools(),
  prompt: "Should we keep the GraphQL gateway or pivot to REST?",
  maxSteps: 5,
});
```

`createEjentumTools()` returns an object map of four AI SDK `Tool` objects keyed by `harness_reasoning`, `harness_code`, `harness_anti_deception`, `harness_memory`. The LLM picks one per turn based on each tool's description.

## MCP alternative

The same four tools are also available via MCP at `https://api.ejentum.com/mcp`. Use [`experimental_createMCPClient`](https://ai-sdk.dev/docs/reference/ai-sdk-core/mcp-client) if you prefer the protocol path:

```ts
import { experimental_createMCPClient as createMCPClient } from "ai";

const mcp = await createMCPClient({
  transport: {
    type: "sse",
    url: "https://api.ejentum.com/mcp",
    headers: { Authorization: `Bearer ${process.env.EJENTUM_API_KEY}` },
  },
});
const tools = await mcp.tools();
```

`ejentum-ai` is the direct-REST path with lighter deps and tighter types; MCP is the universal protocol path. Either works.

## Links

- [`ejentum-ai` on npm](https://www.npmjs.com/package/ejentum-ai)
- [`ejentum-ai` source](https://github.com/ejentum/ejentum-ai)
- [Ejentum docs](https://ejentum.com/docs/api_reference)
