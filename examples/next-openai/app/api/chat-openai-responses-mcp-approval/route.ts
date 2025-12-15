import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  streamText,
  UIMessage,
  InferUITools,
} from 'ai';

export const maxDuration = 60;

const tools = {
  mcp: openai.tools.mcp({
    serverLabel: 'exa',
    serverUrl: 'https://mcp.exa.ai/mcp',
    serverDescription: 'A web-search API for AI agents',
    requireApproval: 'always',
  }),
} as const;

export type OpenAIResponsesMCPApprovalMessage = UIMessage<
  never,
  never,
  InferUITools<typeof tools>
>;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  console.log('\n========== INCOMING REQUEST ==========');
  console.log('UI Messages:', JSON.stringify(messages, null, 2));

  const modelMessages = await convertToModelMessages(messages);
  console.log('\n========== CONVERTED MODEL MESSAGES ==========');
  console.log('Model Messages:', JSON.stringify(modelMessages, null, 2));

  const result = streamText({
    model: openai.responses('gpt-5'),
    system:
      'You are a helpful assistant that can search the web for information. ' +
      'Use the MCP tools available to you to find up-to-date information when needed. ' +
      'When a tool execution is not approved by the user, do not retry it. ' +
      'Just say that the tool execution was not approved.',
    prompt: modelMessages,
    tools,
  });

  return result.toUIMessageStreamResponse();
}
