/**
 * Simple example showing the key pattern for using MCP resources with streamText
 */

import { createMCPClient } from '../src/tool/mcp/mcp-client.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { streamText } from '../src/generate-text/stream-text.js';
import { openai } from '@ai-sdk/openai';

async function main() {
  // 1. Create MCP client
  const mcpClient = await createMCPClient({
    transport: new StdioClientTransport({
      command: 'npx',
      args: ['-y', 'nostr-explore-mcp@latest'],
    }),
  });

  try {
    // 2. Get tools with resources included
    // Setting includeResources: true exposes resources as callable tools
    const tools = await mcpClient.tools({ includeResources: true });

    // 3. Use with streamText - resources are now available as tools!
    const result = streamText({
      model: openai('gpt-4o'),
      tools, // <-- This includes both regular tools AND resources
      maxSteps: 5,
      prompt: 'Fetch recent notes from jack on Nostr and tell me what he posted about',
    });

    // 4. Stream the response
    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
    }

  } finally {
    await mcpClient.close();
  }
}

main().catch(console.error);
