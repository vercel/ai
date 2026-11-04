# AI SDK - Model Context Protocol Client

The **Model Context Protocol (MCP) client** for the
[AI SDK](https://ai-sdk.dev/docs) lets you connect to MCP servers and use their
tools with AI SDK functions like `generateText` and `streamText`.

## Setup

```bash
npm i ai @ai-sdk/mcp
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend
adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { createMCPClient } from '@ai-sdk/mcp';
import { generateText, isStepCount } from 'ai';

const mcpClient = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://your-server.com/mcp',
    headers: {
      Authorization: `Bearer ${process.env.MCP_API_KEY}`,
    },
  },
});

try {
  const tools = await mcpClient.tools();

  const { text } = await generateText({
    model: 'openai/gpt-6-astra',
    tools,
    stopWhen: isStepCount(10),
    prompt: 'Use the available tools to answer the user question.',
  });

  console.log(text);
} finally {
  await mcpClient.close();
}
```

See the [Model Context Protocol Client documentation](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools) for more information.
