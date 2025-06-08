// import { anthropic } from '@ai-sdk/anthropic';
// import { vertex } from '@ai-sdk/google-vertex';
import { perplexity } from '@ai-sdk/perplexity';
import { streamText } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    // model: vertex('gemini-1.5-flash', { useSearchGrounding: true }),
    model: perplexity('sonar-pro'),
    // Claude requires a tool call to use web search
    // model: anthropic('claude-4-sonnet-20250514'),
    // tools: {
    //   web_search: anthropic.tools.webSearch_20250305({
    //     max_uses: 5,
    //   }),
    // },
    messages,
  });

  return result.toDataStreamResponse({
    sendSources: true,
  });
}
