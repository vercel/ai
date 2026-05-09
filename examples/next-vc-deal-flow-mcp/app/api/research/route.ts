import { anthropic } from '@ai-sdk/anthropic';
import { createMCPClient } from '@ai-sdk/mcp';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';

// GitDealFlow Signal — public, no-auth MCP server.
// Tools: get_trending_startups, search_startups_by_sector, get_startup_signal,
//        get_deep_signal, get_signals_summary, get_methodology, get_scout_receipts.
const MCP_URL = 'https://signals.gitdealflow.com/api/mcp/rpc';

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  const mcpClient = await createMCPClient({ transport });

  const tools = await mcpClient.tools();

  const result = streamText({
    model: anthropic('claude-opus-4-7'),
    system:
      'You are a venture research assistant. Use the provided MCP tools to ' +
      'answer questions about engineering momentum at venture-backed startups. ' +
      'Cite the tools you used and the period the signals cover.',
    messages: await convertToModelMessages(messages),
    tools,
    onFinish: async () => {
      await mcpClient.close();
    },
    onError: async () => {
      await mcpClient.close();
    },
  });

  return result.toUIMessageStreamResponse();
}
