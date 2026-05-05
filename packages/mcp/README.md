# AI SDK - MCP Client

The **[@ai-sdk/mcp](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#mcp-tools)** package provides a client for connecting to [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers and using their tools with the [AI SDK](https://ai-sdk.dev/docs).

## Setup

The MCP client is available in the `@ai-sdk/mcp` module. You can install it with

```bash
npm i @ai-sdk/mcp
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Example

```ts
import { createMCPClient } from '@ai-sdk/mcp';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const client = await createMCPClient({
  transport: {
    type: 'sse',
    url: 'https://your-mcp-server.example.com/sse',
  },
});

const tools = await client.tools();

const { text } = await generateText({
  model: openai('gpt-4o'),
  tools,
  prompt: 'What tools do you have available?',
});

await client.close();
```

## Documentation

Please check out the **[MCP tools documentation](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#mcp-tools)** for more information.
