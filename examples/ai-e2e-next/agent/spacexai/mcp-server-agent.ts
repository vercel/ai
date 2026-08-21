import { spacexai } from '@ai-sdk/spacexai';
import { ToolLoopAgent, type InferAgentUIMessage } from 'ai';
export const xaiMcpServerAgent = new ToolLoopAgent({
  model: spacexai.responses('grok-4-1-fast-reasoning'),
  tools: {
    mcp_server: spacexai.tools.mcpServer({
      serverUrl: 'https://mcp.deepwiki.com/mcp',
      serverLabel: 'deepwiki',
      serverDescription: 'DeepWiki MCP server for repository analysis',
    }),
  },
});

export type SpaceXAIMcpServerMessage = InferAgentUIMessage<
  typeof xaiMcpServerAgent
>;
