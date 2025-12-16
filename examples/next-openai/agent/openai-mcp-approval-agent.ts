import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent, InferAgentUIMessage } from 'ai';

export const openaiMCPApprovalAgent = new ToolLoopAgent({
  model: openai.responses('gpt-5'),
  instructions:
    'You are a helpful assistant that can search the web for information. ' +
    'Use the MCP tools available to you to find up-to-date information when needed. ' +
    'When a tool execution is not approved by the user, do not retry it. ' +
    'Just say that the tool execution was not approved.',
  tools: {
    mcp: openai.tools.mcp({
      serverLabel: 'exa',
      serverUrl: 'https://mcp.exa.ai/mcp',
      serverDescription: 'A web-search API for AI agents',
      requireApproval: 'always',
    }),
  },
});

export type OpenAIMCPApprovalAgentUIMessage = InferAgentUIMessage<
  typeof openaiMCPApprovalAgent
>;

