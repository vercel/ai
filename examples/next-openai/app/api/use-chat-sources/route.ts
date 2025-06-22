import { anthropic } from '@ai-sdk/anthropic';
import {
  convertToModelMessages,
  InferUITool,
  streamText,
  UIDataTypes,
  UIMessage,
} from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

const webSearchTool = anthropic.tools.webSearch_20250305();

export type SourcesChatMessage = UIMessage<
  never,
  UIDataTypes,
  { web_search: InferUITool<typeof webSearchTool> }
>;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: anthropic('claude-3-5-sonnet-latest'),
    tools: {
      web_search: webSearchTool,
    },
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    sendSources: true,
  });
}
